mod capture;
mod model;
mod storage;

use std::{
    io::Cursor,
    path::PathBuf,
    sync::{Mutex, MutexGuard},
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use crate::{
    automation_activity::{AutomationLease, AutomationModule},
    buff_assistant::{BuffTarget, CapturePreview, CaptureWindowCandidate, NormalizedRect, windows},
    desktop::{Workspace, WorkspaceState},
    input,
    model::EMERGENCY_STOP_HOTKEY,
    state::AppState,
};
use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use image::{DynamicImage, GrayImage, Luma, RgbaImage};
pub use model::{
    PhysicalPoint, TradeAssistantActivity, TradeAssistantConfig, TradeAssistantSettings,
    TradeAssistantState, TradeCoordinateSlot, TradeMetric, TradeTemplateKind,
};
use tauri::{AppHandle, Emitter, Manager, State};

use capture::{TradeCaptureControl, TradeCaptureFlags};

struct StoredPreview {
    png: Vec<u8>,
    target: BuffTarget,
}

struct RuntimeData {
    config: TradeAssistantConfig,
    activity: TradeAssistantActivity,
    is_running: bool,
    countdown_remaining: u32,
    completed_purchases: u32,
    capture_slot: Option<TradeCoordinateSlot>,
    purchase_confidence: f32,
    purchase_present: bool,
    guard_confidence: f32,
    guard_present: bool,
    guard_confirmed: bool,
    awaiting_purchase_reset: bool,
    last_error: Option<String>,
    run_id: u64,
    storage_directory: PathBuf,
    preview: Option<StoredPreview>,
    capture: Option<TradeCaptureControl>,
    activity_lease: Option<AutomationLease>,
}

pub struct TradeAssistant {
    inner: Mutex<RuntimeData>,
}

impl TradeAssistant {
    pub fn load(app: &AppHandle) -> Result<(Self, Vec<String>), String> {
        let directory = storage::storage_directory(app)?;
        let (config, notices) = storage::load_config(&directory);
        Ok((
            Self {
                inner: Mutex::new(RuntimeData {
                    config,
                    activity: TradeAssistantActivity::Stopped,
                    is_running: false,
                    countdown_remaining: 0,
                    completed_purchases: 0,
                    capture_slot: None,
                    purchase_confidence: 0.0,
                    purchase_present: false,
                    guard_confidence: 0.0,
                    guard_present: false,
                    guard_confirmed: false,
                    awaiting_purchase_reset: false,
                    last_error: None,
                    run_id: 0,
                    storage_directory: directory,
                    preview: None,
                    capture: None,
                    activity_lease: None,
                }),
            },
            notices,
        ))
    }

    fn lock(&self) -> MutexGuard<'_, RuntimeData> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn snapshot(&self) -> TradeAssistantState {
        snapshot(&self.lock())
    }
}

#[tauri::command]
pub fn get_trade_assistant_state(state: State<'_, TradeAssistant>) -> TradeAssistantState {
    state.snapshot()
}

#[tauri::command]
pub fn list_trade_capture_windows() -> Result<Vec<CaptureWindowCandidate>, String> {
    windows::enumerate_candidates()
}

#[tauri::command]
pub fn capture_trade_preview(app: AppHandle, window_id: String) -> Result<CapturePreview, String> {
    require_active(&app)?;
    let (window, candidate) = windows::resolve_window(&window_id)?;
    let image = crate::buff_assistant::capture::capture_snapshot(window)?;
    let png = encode_png(&image)?;
    let target = BuffTarget {
        reference_width: image.width,
        reference_height: image.height,
        ..windows::target_from_candidate(&candidate)
    };
    let data_url = png_data_url(&png);
    app.state::<TradeAssistant>().lock().preview = Some(StoredPreview {
        png,
        target: target.clone(),
    });
    Ok(CapturePreview {
        data_url,
        width: image.width,
        height: image.height,
        target,
    })
}

#[tauri::command]
pub fn save_trade_template(
    app: AppHandle,
    kind: TradeTemplateKind,
    search_region: NormalizedRect,
    crop: NormalizedRect,
    mask_data_url: Option<String>,
) -> Result<TradeAssistantState, String> {
    require_active(&app)?;
    let state = app.state::<TradeAssistant>();
    let (png, target, directory, old) = {
        let inner = state.lock();
        ensure_not_active(&inner)?;
        let preview = inner
            .preview
            .as_ref()
            .ok_or_else(|| "找不到交易行捕获预览，请重新捕获".to_string())?;
        let old = match kind {
            TradeTemplateKind::Purchase => inner.config.purchase_template.clone(),
            TradeTemplateKind::Guard => inner.config.guard_template.clone(),
        };
        (
            preview.png.clone(),
            preview.target.clone(),
            inner.storage_directory.clone(),
            old,
        )
    };
    let source =
        image::load_from_memory(&png).map_err(|error| format!("读取捕获预览失败：{error}"))?;
    let region = search_region.sanitized();
    let template = crop_template(&source, region, crop)?;
    let mask = decode_mask(
        mask_data_url.as_deref(),
        template.width(),
        template.height(),
    )?;
    let id = format!("trade-{}", now_millis());
    let summary = storage::save_template(&directory, kind, &id, &template, &mask)?;
    if let Some(old) = old {
        let _ = storage::delete_template(&directory, kind, &old.template);
    }
    let result = {
        let mut inner = state.lock();
        inner.config.target = Some(target);
        let configured = model::TradeTemplateConfig {
            search_region: region,
            template: summary,
        };
        match kind {
            TradeTemplateKind::Purchase => inner.config.purchase_template = Some(configured),
            TradeTemplateKind::Guard => inner.config.guard_template = Some(configured),
        }
        inner.config.sanitize();
        storage::save_config(&inner.storage_directory, &inner.config)?;
        inner.last_error = None;
        snapshot(&inner)
    };
    emit_state(&app, &result);
    Ok(result)
}

#[tauri::command]
pub fn delete_trade_template(
    app: AppHandle,
    kind: TradeTemplateKind,
) -> Result<TradeAssistantState, String> {
    require_active(&app)?;
    let state = app.state::<TradeAssistant>();
    let result = {
        let mut inner = state.lock();
        ensure_not_active(&inner)?;
        let configured = match kind {
            TradeTemplateKind::Purchase => inner.config.purchase_template.take(),
            TradeTemplateKind::Guard => inner.config.guard_template.take(),
        };
        if let Some(configured) = configured {
            storage::delete_template(&inner.storage_directory, kind, &configured.template)?;
        }
        storage::save_config(&inner.storage_directory, &inner.config)?;
        snapshot(&inner)
    };
    emit_state(&app, &result);
    Ok(result)
}

#[tauri::command]
pub fn update_trade_assistant_settings(
    app: AppHandle,
    mut settings: TradeAssistantSettings,
) -> Result<TradeAssistantState, String> {
    require_active(&app)?;
    settings.sanitize();
    validate_hotkeys(&settings)?;
    let state = app.state::<TradeAssistant>();
    let result = {
        let mut inner = state.lock();
        ensure_not_active(&inner)?;
        inner.config.settings = settings;
        storage::save_config(&inner.storage_directory, &inner.config)?;
        snapshot(&inner)
    };
    crate::shortcuts::register_shortcuts(&app);
    emit_state(&app, &result);
    Ok(result)
}

#[tauri::command]
pub fn set_trade_coordinate_capture(
    app: AppHandle,
    slot: Option<TradeCoordinateSlot>,
) -> Result<TradeAssistantState, String> {
    require_active(&app)?;
    let state = app.state::<TradeAssistant>();
    let result = {
        let mut inner = state.lock();
        ensure_not_active(&inner)?;
        inner.capture_slot = slot;
        inner.last_error = None;
        snapshot(&inner)
    };
    emit_state(&app, &result);
    Ok(result)
}

pub(crate) fn capture_coordinate_internal(app: &AppHandle) -> Result<TradeAssistantState, String> {
    require_active(app)?;
    let state = app.state::<TradeAssistant>();
    let slot = {
        let inner = state.lock();
        inner
            .capture_slot
            .ok_or_else(|| "请先选择要采集的交易行坐标".to_string())?
    };
    let (x, y) = input::get_cursor_position()?;
    let point = PhysicalPoint { x, y };
    let result = {
        let mut inner = state.lock();
        inner.config.coordinates.set(slot, point);
        inner.capture_slot = None;
        storage::save_config(&inner.storage_directory, &inner.config)?;
        snapshot(&inner)
    };
    emit_state(app, &result);
    log(app, format!("已采集{}坐标：({x}, {y})", slot_label(slot)));
    Ok(result)
}

#[tauri::command]
pub fn start_trade_assistant(app: AppHandle) -> Result<TradeAssistantState, String> {
    start_internal(&app)
}

pub(crate) fn start_internal(app: &AppHandle) -> Result<TradeAssistantState, String> {
    require_active(app)?;
    let state = app.state::<TradeAssistant>();
    let (config, directory) = {
        let inner = state.lock();
        ensure_not_active(&inner)?;
        if !inner.config.complete() {
            return Err("请先完成目标窗口、两个模板和三个坐标配置".into());
        }
        (inner.config.clone(), inner.storage_directory.clone())
    };
    validate_hotkeys(&config.settings)?;
    let target = config.target.as_ref().unwrap();
    let window = windows::find_target(target)?.ok_or_else(|| "目标游戏窗口不可用".to_string())?;
    let purchase = config.purchase_template.as_ref().unwrap();
    let guard = config.guard_template.as_ref().unwrap();
    let purchase_template =
        storage::load_template(&directory, TradeTemplateKind::Purchase, &purchase.template)?;
    let guard_template =
        storage::load_template(&directory, TradeTemplateKind::Guard, &guard.template)?;
    let activity_lease = claim_activity(app)?;
    let run_id = {
        let mut inner = state.lock();
        inner.run_id = inner.run_id.wrapping_add(1);
        inner.activity = TradeAssistantActivity::Countdown;
        inner.is_running = true;
        inner.countdown_remaining = config.settings.start_delay_seconds;
        inner.completed_purchases = 0;
        inner.purchase_confidence = 0.0;
        inner.purchase_present = false;
        inner.guard_confidence = 0.0;
        inner.guard_present = false;
        inner.guard_confirmed = false;
        inner.awaiting_purchase_reset = false;
        inner.last_error = None;
        inner.capture_slot = None;
        inner.activity_lease = Some(activity_lease);
        inner.run_id
    };
    let flags = TradeCaptureFlags {
        app: app.clone(),
        run_id,
        purchase_region: purchase.search_region,
        purchase_template,
        purchase_confirm_frames: config.settings.purchase_confirm_frames,
        guard_region: guard.search_region,
        guard_template,
        reference_width: target.reference_width,
        reference_height: target.reference_height,
    };
    match capture::start(window, flags) {
        Ok(control) => {
            let mut control = Some(control);
            let accepted = {
                let mut inner = state.lock();
                if inner.run_id == run_id && inner.activity_lease == Some(activity_lease) {
                    inner.capture = control.take();
                    true
                } else {
                    false
                }
            };
            if !accepted {
                if let Some(control) = control {
                    let _ = control.stop();
                }
                release_activity(app, Some(activity_lease));
                return Err("交易行助手启动已经取消".into());
            }
        }
        Err(error) => {
            let lease = {
                let mut inner = state.lock();
                if inner.run_id == run_id && inner.activity_lease == Some(activity_lease) {
                    inner.run_id = inner.run_id.wrapping_add(1);
                    inner.is_running = false;
                    inner.activity = TradeAssistantActivity::Error;
                    inner.countdown_remaining = 0;
                    inner.last_error = Some(error.clone());
                    inner.activity_lease.take()
                } else {
                    Some(activity_lease)
                }
            };
            release_activity(app, lease);
            return Err(error);
        }
    }
    let result = state.snapshot();
    emit_state(app, &result);
    log(app, "交易行助手开始倒计时，请保持搜索框已打开");
    let handle = app.clone();
    thread::spawn(move || run_loop(handle, run_id));
    Ok(result)
}

#[tauri::command]
pub fn stop_trade_assistant(app: AppHandle) -> TradeAssistantState {
    stop_internal(&app, "手动停止交易行助手")
}

pub(crate) fn stop_internal(app: &AppHandle, reason: &str) -> TradeAssistantState {
    let state = app.state::<TradeAssistant>();
    let (control, lease, changed, result) = {
        let mut inner = state.lock();
        let changed = inner.is_running || inner.activity == TradeAssistantActivity::Testing;
        inner.run_id = inner.run_id.wrapping_add(1);
        inner.is_running = false;
        inner.activity = TradeAssistantActivity::Stopped;
        inner.countdown_remaining = 0;
        inner.capture_slot = None;
        inner.purchase_present = false;
        inner.guard_present = false;
        (
            inner.capture.take(),
            inner.activity_lease.take(),
            changed,
            snapshot(&inner),
        )
    };
    if let Some(control) = control {
        let _ = control.stop();
    }
    release_activity(app, lease);
    emit_state(app, &result);
    if changed {
        log(app, reason);
    }
    result
}

#[tauri::command]
pub fn start_trade_template_test(
    app: AppHandle,
    window_id: String,
) -> Result<TradeAssistantState, String> {
    require_active(&app)?;
    let state = app.state::<TradeAssistant>();
    let (config, directory) = {
        let inner = state.lock();
        ensure_not_active(&inner)?;
        (inner.config.clone(), inner.storage_directory.clone())
    };
    let purchase = config
        .purchase_template
        .as_ref()
        .ok_or_else(|| "尚未配置购买图标模板".to_string())?;
    let guard = config
        .guard_template
        .as_ref()
        .ok_or_else(|| "尚未配置商城状态图标模板".to_string())?;
    let (window, _) = windows::resolve_window(&window_id)?;
    let target = config
        .target
        .as_ref()
        .ok_or_else(|| "尚未配置交易行目标窗口".to_string())?;
    let run_id = {
        let mut inner = state.lock();
        inner.run_id = inner.run_id.wrapping_add(1);
        inner.activity = TradeAssistantActivity::Testing;
        inner.last_error = None;
        inner.run_id
    };
    let control = capture::start(
        window,
        TradeCaptureFlags {
            app: app.clone(),
            run_id,
            purchase_region: purchase.search_region,
            purchase_template: storage::load_template(
                &directory,
                TradeTemplateKind::Purchase,
                &purchase.template,
            )?,
            purchase_confirm_frames: config.settings.purchase_confirm_frames,
            guard_region: guard.search_region,
            guard_template: storage::load_template(
                &directory,
                TradeTemplateKind::Guard,
                &guard.template,
            )?,
            reference_width: target.reference_width,
            reference_height: target.reference_height,
        },
    )?;
    state.lock().capture = Some(control);
    let result = state.snapshot();
    emit_state(&app, &result);
    Ok(result)
}

#[tauri::command]
pub fn stop_trade_template_test(app: AppHandle) -> TradeAssistantState {
    stop_internal(&app, "停止交易行模板测试")
}

fn run_loop(app: AppHandle, run_id: u64) {
    let start_delay = app
        .state::<TradeAssistant>()
        .lock()
        .config
        .settings
        .start_delay_seconds;
    for remaining in (1..=start_delay).rev() {
        if !update_countdown(&app, run_id, remaining) {
            return;
        }
        if !wait_current(&app, run_id, Duration::from_secs(1)) {
            return;
        }
    }
    if !set_activity(&app, run_id, TradeAssistantActivity::Validating) {
        return;
    }
    if let Err(error) = wait_for_guard_validation(&app, run_id) {
        fail_run(&app, run_id, error);
        return;
    }
    loop {
        let should_buy = {
            let state = app.state::<TradeAssistant>();
            let mut inner = state.lock();
            if !is_current(&inner, run_id) {
                return;
            }
            if inner.purchase_present && !inner.awaiting_purchase_reset {
                inner.activity = TradeAssistantActivity::Buying;
                true
            } else {
                inner.activity = TradeAssistantActivity::ClickingRecord;
                false
            }
        };
        emit_current(&app);
        if should_buy {
            if let Err(error) = perform_purchase(&app, run_id) {
                fail_run(&app, run_id, error);
                return;
            }
            let (completed, goal, purchase_delay, search_delay) = {
                let state = app.state::<TradeAssistant>();
                let inner = state.lock();
                (
                    inner.completed_purchases,
                    inner.config.settings.purchase_count,
                    inner.config.settings.purchase_to_search_delay_ms,
                    inner.config.settings.search_to_click_delay_ms,
                )
            };
            if completed >= goal {
                complete_run(&app, run_id);
                return;
            }
            if !wait_current(&app, run_id, Duration::from_millis(purchase_delay)) {
                return;
            }
            if !set_activity(&app, run_id, TradeAssistantActivity::ReopeningSearch) {
                return;
            }
            if let Err(error) = click_slot(&app, run_id, TradeCoordinateSlot::Search) {
                fail_run(&app, run_id, error);
                return;
            }
            {
                let state = app.state::<TradeAssistant>();
                let mut inner = state.lock();
                if !is_current(&inner, run_id) {
                    return;
                }
                inner.awaiting_purchase_reset = true;
                inner.purchase_present = false;
            }
            if !wait_current(&app, run_id, Duration::from_millis(search_delay)) {
                return;
            }
        } else {
            if let Err(error) = click_slot(&app, run_id, TradeCoordinateSlot::Record) {
                fail_run(&app, run_id, error);
                return;
            }
            let interval = app
                .state::<TradeAssistant>()
                .lock()
                .config
                .settings
                .click_interval_ms;
            if !wait_current(&app, run_id, Duration::from_millis(interval)) {
                return;
            }
        }
    }
}

fn perform_purchase(app: &AppHandle, run_id: u64) -> Result<(), String> {
    click_slot(app, run_id, TradeCoordinateSlot::Purchase)?;
    let result = {
        let state = app.state::<TradeAssistant>();
        let mut inner = state.lock();
        if !is_current(&inner, run_id) {
            return Err("交易行运行已经停止".into());
        }
        inner.completed_purchases = inner.completed_purchases.saturating_add(1);
        snapshot(&inner)
    };
    emit_state(app, &result);
    log(
        app,
        format!(
            "已发送第 {} 次购买点击（不代表游戏内成交）",
            result.completed_purchases
        ),
    );
    Ok(())
}

fn click_slot(app: &AppHandle, run_id: u64, slot: TradeCoordinateSlot) -> Result<(), String> {
    let state = app.state::<TradeAssistant>();
    let inner = state.lock();
    if !is_current(&inner, run_id) {
        return Err("交易行运行已经停止".into());
    }
    require_active(app)?;
    let point = inner
        .config
        .coordinates
        .get(slot)
        .ok_or_else(|| format!("{}坐标未配置", slot_label(slot)))?;
    input::click(point.x, point.y)
}

fn validate_runtime(app: &AppHandle, run_id: u64) -> Result<(), String> {
    let state = app.state::<TradeAssistant>();
    let inner = state.lock();
    if !is_current(&inner, run_id) {
        return Err("交易行运行已经停止".into());
    }
    require_active(app)?;
    Ok(())
}

fn wait_for_guard_validation(app: &AppHandle, run_id: u64) -> Result<(), String> {
    let started = Instant::now();
    loop {
        validate_runtime(app, run_id)?;
        {
            let state = app.state::<TradeAssistant>();
            let inner = state.lock();
            if inner.guard_confirmed {
                return Ok(());
            }
        }
        if started.elapsed() >= Duration::from_secs(1) {
            return Err("倒计时结束时未确认商城状态图标，请确认搜索框和商城界面已经打开".into());
        }
        thread::sleep(Duration::from_millis(20));
    }
}

pub(crate) fn handle_detection_frame(
    app: &AppHandle,
    run_id: u64,
    purchase_confidence: f32,
    purchase_present: bool,
    guard_confidence: f32,
    guard_present: bool,
    guard_absent: bool,
) {
    let (result, should_fail) = {
        let state = app.state::<TradeAssistant>();
        let mut inner = state.lock();
        if inner.run_id != run_id {
            return;
        }
        inner.purchase_confidence = purchase_confidence;
        if inner.awaiting_purchase_reset {
            if !purchase_present {
                inner.awaiting_purchase_reset = false;
            }
            inner.purchase_present = false;
        } else {
            inner.purchase_present = purchase_present;
        }
        inner.guard_confidence = guard_confidence;
        inner.guard_present = guard_present;
        if guard_present {
            inner.guard_confirmed = true;
        }
        let should_fail = inner.is_running && inner.guard_confirmed && guard_absent;
        (snapshot(&inner), should_fail)
    };
    let _ = app.emit(
        "trade-assistant-metric",
        TradeMetric {
            purchase_confidence,
            purchase_present: result.purchase_present,
            guard_confidence,
            guard_present,
        },
    );
    emit_state(app, &result);
    if should_fail {
        fail_run(
            app,
            run_id,
            "商城状态图标连续 3 帧缺失，可能已经退出商城".into(),
        );
    }
}

pub(crate) fn handle_capture_error(app: &AppHandle, run_id: u64, error: String) {
    fail_run(app, run_id, error);
}

fn fail_run(app: &AppHandle, run_id: u64, error: String) {
    let state = app.state::<TradeAssistant>();
    let (control, lease, result) = {
        let mut inner = state.lock();
        if inner.run_id != run_id {
            return;
        }
        inner.run_id = inner.run_id.wrapping_add(1);
        inner.is_running = false;
        inner.activity = TradeAssistantActivity::Error;
        inner.countdown_remaining = 0;
        inner.last_error = Some(error.clone());
        (
            inner.capture.take(),
            inner.activity_lease.take(),
            snapshot(&inner),
        )
    };
    if let Some(control) = control {
        let _ = control.stop();
    }
    release_activity(app, lease);
    emit_state(app, &result);
    log(app, format!("交易行助手停止：{error}"));
}

fn complete_run(app: &AppHandle, run_id: u64) {
    let state = app.state::<TradeAssistant>();
    let (control, lease, result) = {
        let mut inner = state.lock();
        if inner.run_id != run_id {
            return;
        }
        inner.run_id = inner.run_id.wrapping_add(1);
        inner.is_running = false;
        inner.activity = TradeAssistantActivity::Completed;
        inner.countdown_remaining = 0;
        (
            inner.capture.take(),
            inner.activity_lease.take(),
            snapshot(&inner),
        )
    };
    if let Some(control) = control {
        let _ = control.stop();
    }
    release_activity(app, lease);
    emit_state(app, &result);
    log(
        app,
        format!("交易行助手已完成 {} 次购买点击", result.completed_purchases),
    );
}

fn wait_current(app: &AppHandle, run_id: u64, duration: Duration) -> bool {
    let started = Instant::now();
    while started.elapsed() < duration {
        {
            let state = app.state::<TradeAssistant>();
            let inner = state.lock();
            if !is_current(&inner, run_id) {
                return false;
            }
        }
        thread::sleep((duration - started.elapsed()).min(Duration::from_millis(10)));
    }
    true
}

fn update_countdown(app: &AppHandle, run_id: u64, remaining: u32) -> bool {
    let result = {
        let state = app.state::<TradeAssistant>();
        let mut inner = state.lock();
        if !is_current(&inner, run_id) {
            return false;
        }
        inner.countdown_remaining = remaining;
        snapshot(&inner)
    };
    emit_state(app, &result);
    true
}

fn set_activity(app: &AppHandle, run_id: u64, activity: TradeAssistantActivity) -> bool {
    let result = {
        let state = app.state::<TradeAssistant>();
        let mut inner = state.lock();
        if !is_current(&inner, run_id) {
            return false;
        }
        inner.activity = activity;
        inner.countdown_remaining = 0;
        snapshot(&inner)
    };
    emit_state(app, &result);
    true
}

fn is_current(inner: &RuntimeData, run_id: u64) -> bool {
    inner.is_running && inner.run_id == run_id
}

fn require_active(app: &AppHandle) -> Result<(), String> {
    if app.state::<WorkspaceState>().active() == Workspace::TradeAssistant {
        Ok(())
    } else {
        Err("交易行助手不是当前工作区".into())
    }
}

fn ensure_not_active(inner: &RuntimeData) -> Result<(), String> {
    if inner.is_running || inner.activity == TradeAssistantActivity::Testing {
        Err("请先停止交易行助手或模板测试".into())
    } else {
        Ok(())
    }
}

fn claim_activity(app: &AppHandle) -> Result<AutomationLease, String> {
    let state = app.state::<AppState>();
    let mut inner = state.lock();
    if inner.state.is_running || inner.state.is_recording {
        return Err("已有其他自动化任务正在运行".into());
    }
    inner
        .automation_activity
        .claim(AutomationModule::TradeAssistant)
        .ok_or_else(|| "已有其他自动化任务正在运行".into())
}

fn release_activity(app: &AppHandle, lease: Option<AutomationLease>) {
    if let Some(lease) = lease {
        app.state::<AppState>()
            .lock()
            .automation_activity
            .release(lease);
    }
}

fn validate_hotkeys(settings: &TradeAssistantSettings) -> Result<(), String> {
    let values = [
        &settings.hotkeys.capture,
        &settings.hotkeys.start,
        &settings.hotkeys.stop,
    ];
    if values.iter().any(|value| value.trim().is_empty()) {
        return Err("交易行热键不能为空".into());
    }
    for (index, value) in values.iter().enumerate() {
        if value.eq_ignore_ascii_case(EMERGENCY_STOP_HOTKEY) {
            return Err("交易行热键不能与紧急停止热键冲突".into());
        }
        if values
            .iter()
            .skip(index + 1)
            .any(|other| value.eq_ignore_ascii_case(other))
        {
            return Err("交易行模块内部热键不能重复".into());
        }
    }
    Ok(())
}

pub(crate) fn hotkeys(app: &AppHandle) -> model::TradeAssistantHotkeys {
    app.state::<TradeAssistant>()
        .lock()
        .config
        .settings
        .hotkeys
        .clone()
}

fn snapshot(inner: &RuntimeData) -> TradeAssistantState {
    TradeAssistantState {
        config: inner.config.clone(),
        activity: inner.activity,
        is_running: inner.is_running,
        countdown_remaining: inner.countdown_remaining,
        completed_purchases: inner.completed_purchases,
        capture_slot: inner.capture_slot,
        purchase_confidence: inner.purchase_confidence,
        purchase_present: inner.purchase_present,
        guard_confidence: inner.guard_confidence,
        guard_present: inner.guard_present,
        last_error: inner.last_error.clone(),
    }
}

fn emit_state(app: &AppHandle, state: &TradeAssistantState) {
    let _ = app.emit("trade-assistant-state", state);
}
fn emit_current(app: &AppHandle) {
    emit_state(app, &app.state::<TradeAssistant>().snapshot());
}
fn log(app: &AppHandle, message: impl Into<String>) {
    let _ = app.emit("trade-assistant-execution-log", message.into());
}

pub(crate) fn report_action_error(app: &AppHandle, error: String) {
    let result = {
        let state = app.state::<TradeAssistant>();
        let mut inner = state.lock();
        inner.last_error = Some(error.clone());
        snapshot(&inner)
    };
    emit_state(app, &result);
    log(app, format!("操作失败：{error}"));
}

fn encode_png(image: &crate::buff_assistant::capture::CapturedImage) -> Result<Vec<u8>, String> {
    let rgba = RgbaImage::from_raw(image.width, image.height, image.rgba.clone())
        .ok_or_else(|| "捕获画面像素格式无效".to_string())?;
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::ImageRgba8(rgba)
        .write_to(&mut bytes, image::ImageFormat::Png)
        .map_err(|error| format!("编码 PNG 失败：{error}"))?;
    Ok(bytes.into_inner())
}

fn png_data_url(png: &[u8]) -> String {
    format!("data:image/png;base64,{}", BASE64.encode(png))
}

fn crop_template(
    preview: &DynamicImage,
    search_region: NormalizedRect,
    crop: NormalizedRect,
) -> Result<DynamicImage, String> {
    let (rx, ry, rex, rey) = search_region.pixel_bounds(preview.width(), preview.height());
    let region = preview.crop_imm(rx, ry, rex - rx, rey - ry);
    let (x, y, ex, ey) = crop.pixel_bounds(region.width(), region.height());
    if ex - x < 8 || ey - y < 8 {
        return Err("模板区域过小，请重新框选图标".into());
    }
    Ok(region.crop_imm(x, y, ex - x, ey - y))
}

fn decode_mask(data_url: Option<&str>, width: u32, height: u32) -> Result<GrayImage, String> {
    let Some(data_url) = data_url else {
        return Ok(GrayImage::from_pixel(width, height, Luma([255])));
    };
    let encoded = data_url
        .split_once(',')
        .map(|(_, value)| value)
        .ok_or_else(|| "模板遮罩格式无效".to_string())?;
    let bytes = BASE64
        .decode(encoded)
        .map_err(|error| format!("解析模板遮罩失败：{error}"))?;
    let mask = image::load_from_memory(&bytes)
        .map_err(|error| format!("读取模板遮罩失败：{error}"))?
        .into_luma8();
    if mask.dimensions() == (width, height) {
        Ok(mask)
    } else {
        Ok(image::imageops::resize(
            &mask,
            width,
            height,
            image::imageops::FilterType::Nearest,
        ))
    }
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(i64::MAX as u128) as i64
}

fn slot_label(slot: TradeCoordinateSlot) -> &'static str {
    match slot {
        TradeCoordinateSlot::Record => "搜索记录（点位一）",
        TradeCoordinateSlot::Purchase => "购买（点位二）",
        TradeCoordinateSlot::Search => "打开搜索框（点位三）",
    }
}

#[cfg(test)]
mod tests {
    use super::model::*;

    #[test]
    fn settings_are_clamped_to_safe_ranges() {
        let mut settings = TradeAssistantSettings {
            purchase_count: 0,
            click_interval_ms: 1,
            purchase_confirm_frames: 20,
            purchase_to_search_delay_ms: 9_000,
            search_to_click_delay_ms: 9_000,
            start_delay_seconds: 30,
            hotkeys: TradeAssistantHotkeys::default(),
        };
        settings.sanitize();
        assert_eq!(settings.purchase_count, 1);
        assert_eq!(settings.click_interval_ms, 20);
        assert_eq!(settings.purchase_confirm_frames, 5);
        assert_eq!(settings.start_delay_seconds, 10);
        assert_eq!(settings.hotkeys.capture, "CommandOrControl+Alt+Q");
    }

    #[test]
    fn negative_screen_coordinates_are_supported() {
        let mut coordinates = TradeCoordinates::default();
        coordinates.set(
            TradeCoordinateSlot::Record,
            PhysicalPoint { x: -100, y: -20 },
        );
        assert_eq!(coordinates.record, Some(PhysicalPoint { x: -100, y: -20 }));
    }
}
