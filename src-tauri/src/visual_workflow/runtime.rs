use std::{
    collections::BTreeSet,
    io::Cursor,
    sync::{
        Arc, Mutex, MutexGuard,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use image::{DynamicImage, GrayImage, RgbaImage};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::{
    automation_activity::{AutomationLease, AutomationModule},
    buff_assistant::{
        BuffTarget, CapturePreview, CaptureWindowCandidate,
        capture::capture_snapshot as capture_window_snapshot, windows as capture_windows,
    },
    input,
    model::{KeyModifier, normalize_key},
    raw_input::RawMouseButton,
    state::AppState,
};

use super::{
    DetectorResource, DetectorState, DetectorTemplateRef, Diagnostic, DiagnosticSeverity,
    ExecutionControl, ExecutionEvent, ExecutionEventKind, ExecutionInputs, ExecutionStatus,
    Interpreter, KeyChord, MouseButton, NormalizedRegion, PointResource, TargetState, TruthValue,
    WORKFLOW_SCHEMA_VERSION, WorkflowClock, WorkflowDefinition, WorkflowInput, WorkflowNode,
    WorkflowResources, WorkflowStep, WorkflowTarget, WorkflowVision, capture, has_errors, platform,
    storage, validate_workflow,
};

const STATE_EVENT: &str = "visual-workflow-state";
const PROGRESS_EVENT: &str = "visual-workflow-progress";
const LOG_EVENT: &str = "visual-workflow-execution-log";
const START_COUNTDOWN_SECONDS: u64 = 3;
const COUNTDOWN_SLICE_MS: u64 = 50;
const PROGRESS_MIN_INTERVAL_MS: u64 = 50;
const INITIAL_DETECTOR_TIMEOUT_MS: u64 = 15_000;
const DETECTOR_WAIT_SLICE_MS: u64 = 25;
const MAX_MASK_DATA_URL_BYTES: usize = 24 * 1024 * 1024;
static TEMPLATE_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum VisualWorkflowActivity {
    #[default]
    Idle,
    Validating,
    Countdown,
    Running,
    Waiting,
    Testing,
    Completed,
    Error,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VisualWorkflowState {
    pub run_id: u64,
    pub definition: WorkflowDefinition,
    pub activity: VisualWorkflowActivity,
    pub is_running: bool,
    pub countdown_remaining: u64,
    pub current_step_id: Option<String>,
    pub diagnostics: Vec<Diagnostic>,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct VisualWorkflowProgress {
    run_id: u64,
    activity: VisualWorkflowActivity,
    is_running: bool,
    countdown_remaining: u64,
    current_step_id: Option<String>,
}

struct RuntimeData {
    definition: WorkflowDefinition,
    activity: VisualWorkflowActivity,
    is_running: bool,
    countdown_remaining: u64,
    current_step_id: Option<String>,
    diagnostics: Vec<Diagnostic>,
    last_error: Option<String>,
    run_id: u64,
    cancel: Option<Arc<AtomicBool>>,
    action_gate: Arc<Mutex<()>>,
    activity_lease: Option<AutomationLease>,
    storage_directory: std::path::PathBuf,
    preview: Option<StoredPreview>,
}

#[derive(Clone)]
struct StoredPreview {
    png: Vec<u8>,
    width: u32,
    height: u32,
    target: BuffTarget,
}

struct PreparedCapture {
    snapshots: capture::DetectorSnapshotStore,
    control: Option<capture::VisualCaptureControl>,
    error: Arc<Mutex<Option<String>>>,
}

pub struct VisualWorkflow {
    inner: Mutex<RuntimeData>,
}

impl VisualWorkflow {
    pub fn load(app: &AppHandle) -> Result<(Self, Vec<String>), String> {
        let directory = storage::storage_directory(app)?;
        let mut notices = Vec::new();
        let definition = match storage::load_config::<WorkflowDefinition>(&directory) {
            Ok(Some(definition)) => definition,
            Ok(None) => default_definition(),
            Err(error) => {
                notices.push(format!("视觉流程配置读取失败，已使用空流程：{error}"));
                default_definition()
            }
        };
        let diagnostics = validate_workflow(&definition);
        Ok((
            Self {
                inner: Mutex::new(RuntimeData {
                    definition,
                    activity: VisualWorkflowActivity::Idle,
                    is_running: false,
                    countdown_remaining: 0,
                    current_step_id: None,
                    diagnostics,
                    last_error: None,
                    run_id: 0,
                    cancel: None,
                    action_gate: Arc::new(Mutex::new(())),
                    activity_lease: None,
                    storage_directory: directory,
                    preview: None,
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

    pub fn snapshot(&self) -> VisualWorkflowState {
        snapshot(&self.lock())
    }
}

#[tauri::command]
pub fn get_visual_workflow_state(state: State<'_, VisualWorkflow>) -> VisualWorkflowState {
    state.snapshot()
}

#[tauri::command]
pub fn list_visual_workflow_capture_windows() -> Result<Vec<CaptureWindowCandidate>, String> {
    capture_windows::enumerate_candidates()
}

#[tauri::command]
pub fn capture_visual_workflow_preview(
    state: State<'_, VisualWorkflow>,
    window_id: String,
) -> Result<CapturePreview, String> {
    {
        let inner = state.lock();
        ensure_not_running(&inner)?;
    }
    let (window, candidate) = capture_windows::resolve_window(&window_id)?;
    if platform::belongs_to_current_process(platform::raw_handle(&window)) {
        return Err("不能将本应用窗口设为视觉流程目标".into());
    }
    let image = capture_window_snapshot(window)?;
    let png = encode_preview_png(&image)?;
    let target = BuffTarget {
        reference_width: image.width,
        reference_height: image.height,
        ..capture_windows::target_from_candidate(&candidate)
    };
    let result = CapturePreview {
        data_url: format!("data:image/png;base64,{}", BASE64.encode(&png)),
        width: image.width,
        height: image.height,
        target: target.clone(),
    };
    {
        let mut inner = state.lock();
        ensure_not_running(&inner)?;
        inner.preview = Some(StoredPreview {
            png,
            width: image.width,
            height: image.height,
            target,
        });
    }
    Ok(result)
}

#[tauri::command]
pub fn save_visual_workflow_detector_template(
    app: AppHandle,
    mut definition: WorkflowDefinition,
    detector_id: String,
    search_region: NormalizedRegion,
    crop: NormalizedRegion,
    mask_data_url: Option<String>,
) -> Result<VisualWorkflowState, String> {
    let state = app.state::<VisualWorkflow>();
    let (preview, directory) = {
        let inner = state.lock();
        ensure_not_running(&inner)?;
        ensure_unique_detector(&definition, &detector_id)?;
        let preview = inner
            .preview
            .clone()
            .ok_or_else(|| "找不到视觉流程捕获预览，请重新捕获".to_string())?;
        (preview, inner.storage_directory.clone())
    };

    let source = image::load_from_memory(&preview.png)
        .map_err(|error| format!("读取视觉流程捕获预览失败：{error}"))?;
    if source.width() != preview.width || source.height() != preview.height {
        return Err("视觉流程捕获预览尺寸不一致，请重新捕获".into());
    }
    let template = crop_template_from_preview(&source, search_region, crop)?;
    let mask = decode_strict_mask(
        mask_data_url.as_deref(),
        template.width(),
        template.height(),
    )?;
    let new_asset_id = unique_template_asset_id();
    if let Err(error) = storage::save_template(&directory, &new_asset_id, &template, mask.as_ref())
    {
        let _ = storage::delete_template(&directory, &new_asset_id);
        return Err(error);
    }

    let update_result = (|| {
        let mut inner = state.lock();
        ensure_not_running(&inner)?;
        let detector = unique_detector_mut(&mut definition, &detector_id)?;
        let old_template = detector.template.clone();
        detector.search_region = search_region;
        detector.template = DetectorTemplateRef {
            asset_id: new_asset_id.clone(),
            mask_asset_id: mask.as_ref().map(|_| new_asset_id.clone()),
            width: template.width(),
            height: template.height(),
            capture_reference_width: preview.width,
            capture_reference_height: preview.height,
        };
        definition.target = Some(workflow_target_from_buff(&preview.target));
        let diagnostics = validate_workflow(&definition);
        storage::save_config(&inner.storage_directory, &definition)?;
        inner.definition = definition;
        inner.diagnostics = diagnostics;
        inner.last_error = None;
        inner.activity = VisualWorkflowActivity::Idle;
        let cleanup_warnings = delete_unreferenced_assets(
            &inner.storage_directory,
            referenced_assets(&old_template),
            &inner.definition,
        );
        Ok::<_, String>((snapshot(&inner), cleanup_warnings))
    })();

    let (result, cleanup_warnings) = match update_result {
        Ok(result) => result,
        Err(error) => {
            let _ = storage::delete_template(&directory, &new_asset_id);
            return Err(error);
        }
    };
    emit_state(&app, &result);
    for warning in cleanup_warnings {
        emit_log(&app, warning);
    }
    Ok(result)
}

#[tauri::command]
pub fn delete_visual_workflow_detector_template(
    app: AppHandle,
    mut definition: WorkflowDefinition,
    detector_id: String,
) -> Result<VisualWorkflowState, String> {
    let state = app.state::<VisualWorkflow>();
    let (result, cleanup_warnings) = {
        let mut inner = state.lock();
        ensure_not_running(&inner)?;
        let detector = unique_detector_mut(&mut definition, &detector_id)?;
        let old_template = detector.template.clone();
        detector.template = DetectorTemplateRef {
            asset_id: String::new(),
            mask_asset_id: None,
            width: 0,
            height: 0,
            capture_reference_width: 0,
            capture_reference_height: 0,
        };
        let diagnostics = validate_workflow(&definition);
        storage::save_config(&inner.storage_directory, &definition)?;
        inner.definition = definition;
        inner.diagnostics = diagnostics;
        inner.last_error = None;
        inner.activity = VisualWorkflowActivity::Idle;
        let cleanup_warnings = delete_unreferenced_assets(
            &inner.storage_directory,
            referenced_assets(&old_template),
            &inner.definition,
        );
        (snapshot(&inner), cleanup_warnings)
    };
    emit_state(&app, &result);
    for warning in cleanup_warnings {
        emit_log(&app, warning);
    }
    Ok(result)
}

#[tauri::command]
pub fn save_visual_workflow(
    app: AppHandle,
    definition: WorkflowDefinition,
) -> Result<VisualWorkflowState, String> {
    let workflow = app.state::<VisualWorkflow>();
    let diagnostics = validate_workflow(&definition);
    let result = {
        let mut inner = workflow.lock();
        ensure_not_running(&inner)?;
        storage::save_config(&inner.storage_directory, &definition)?;
        inner.definition = definition;
        inner.diagnostics = diagnostics;
        inner.last_error = None;
        inner.activity = VisualWorkflowActivity::Idle;
        snapshot(&inner)
    };
    emit_state(&app, &result);
    Ok(result)
}

#[tauri::command]
pub fn validate_visual_workflow(app: AppHandle, definition: WorkflowDefinition) -> Vec<Diagnostic> {
    let diagnostics = validate_workflow(&definition);
    let state = app.state::<VisualWorkflow>();
    let result = {
        let mut inner = state.lock();
        if !inner.is_running {
            inner.diagnostics = diagnostics.clone();
        }
        snapshot(&inner)
    };
    emit_state(&app, &result);
    diagnostics
}

#[tauri::command]
pub fn start_visual_workflow(
    app: AppHandle,
    definition: WorkflowDefinition,
) -> Result<VisualWorkflowState, String> {
    let diagnostics = validate_workflow(&definition);
    if has_errors(&diagnostics) {
        let message = format!(
            "视觉流程校验失败，共有 {} 个错误",
            diagnostics
                .iter()
                .filter(|item| item.severity == DiagnosticSeverity::Error)
                .count()
        );
        let state = app.state::<VisualWorkflow>();
        let result = {
            let mut inner = state.lock();
            ensure_not_running(&inner)?;
            inner.diagnostics = diagnostics;
            inner.last_error = Some(message.clone());
            inner.activity = VisualWorkflowActivity::Error;
            snapshot(&inner)
        };
        emit_state(&app, &result);
        return Err(message);
    }

    let activity_lease = claim_activity(&app)?;
    let state = app.state::<VisualWorkflow>();
    let (run_id, cancel, action_gate, result) = {
        let mut inner = state.lock();
        if let Err(error) = ensure_not_running(&inner) {
            release_activity(&app, Some(activity_lease));
            return Err(error);
        }
        if let Err(error) = storage::save_config(&inner.storage_directory, &definition) {
            release_activity(&app, Some(activity_lease));
            return Err(error);
        }
        inner.run_id = inner.run_id.wrapping_add(1);
        let run_id = inner.run_id;
        let cancel = Arc::new(AtomicBool::new(false));
        inner.definition = definition.clone();
        inner.activity = VisualWorkflowActivity::Countdown;
        inner.is_running = true;
        inner.countdown_remaining = START_COUNTDOWN_SECONDS;
        inner.current_step_id = None;
        inner.diagnostics = diagnostics;
        inner.last_error = None;
        inner.cancel = Some(cancel.clone());
        inner.activity_lease = Some(activity_lease);
        (run_id, cancel, inner.action_gate.clone(), snapshot(&inner))
    };

    emit_state(&app, &result);
    emit_log(
        &app,
        format!(
            "视觉流程“{}”将在 {START_COUNTDOWN_SECONDS} 秒后启动，请将目标窗口切到前台",
            definition.name
        ),
    );
    let worker_app = app.clone();
    thread::spawn(move || {
        run_worker(
            worker_app,
            run_id,
            activity_lease,
            definition,
            cancel,
            action_gate,
        );
    });
    Ok(result)
}

#[tauri::command]
pub fn stop_visual_workflow(app: AppHandle) -> VisualWorkflowState {
    stop_internal(&app, "手动停止视觉流程")
}

pub(crate) fn stop_internal(app: &AppHandle, reason: &str) -> VisualWorkflowState {
    let state = app.state::<VisualWorkflow>();
    let (gate, was_running) = {
        let mut inner = state.lock();
        let was_running = inner.is_running;
        if let Some(cancel) = &inner.cancel {
            cancel.store(true, Ordering::SeqCst);
        }
        inner.run_id = inner.run_id.wrapping_add(1);
        (inner.action_gate.clone(), was_running)
    };

    // Waiting for the shared action gate is the stop barrier: after this lock has been acquired,
    // every in-flight injection has returned and every future injection observes cancellation.
    let _barrier = lock_unpoisoned(&gate);
    let (lease, result) = {
        let mut inner = state.lock();
        inner.is_running = false;
        inner.activity = VisualWorkflowActivity::Idle;
        inner.countdown_remaining = 0;
        inner.current_step_id = None;
        inner.cancel = None;
        let lease = inner.activity_lease.take();
        (lease, snapshot(&inner))
    };
    release_activity(app, lease);
    emit_state(app, &result);
    if was_running {
        emit_log(app, reason);
    }
    result
}

fn run_worker(
    app: AppHandle,
    run_id: u64,
    activity_lease: AutomationLease,
    definition: WorkflowDefinition,
    cancel: Arc<AtomicBool>,
    action_gate: Arc<Mutex<()>>,
) {
    if !run_countdown(&app, run_id, &cancel) {
        return;
    }

    let configured_target = match definition.target.as_ref() {
        Some(target) => buff_target_from_workflow(target),
        None => {
            finish_with_error(
                &app,
                run_id,
                activity_lease,
                "视觉流程尚未绑定目标窗口".into(),
            );
            return;
        }
    };
    let target_window = match find_exact_target(&configured_target) {
        Ok(Some(window)) => window,
        Ok(None) => {
            finish_with_error(
                &app,
                run_id,
                activity_lease,
                "已配置的视觉流程目标窗口不可用".into(),
            );
            return;
        }
        Err(error) => {
            finish_with_error(&app, run_id, activity_lease, error);
            return;
        }
    };
    let target = platform::raw_handle(&target_window);
    if platform::belongs_to_current_process(target) {
        finish_with_error(
            &app,
            run_id,
            activity_lease,
            "不能将本应用窗口设为视觉流程目标".into(),
        );
        return;
    }
    if !platform::foreground(target) {
        finish_with_error(
            &app,
            run_id,
            activity_lease,
            "请在倒计时结束前将已配置的目标窗口切到前台".into(),
        );
        return;
    }
    if platform::minimized(target) {
        finish_with_error(
            &app,
            run_id,
            activity_lease,
            "已配置的目标窗口处于最小化状态".into(),
        );
        return;
    }
    let PreparedCapture {
        snapshots: snapshot_store,
        control: capture_control,
        error: capture_error,
    } = match prepare_capture(&app, &definition, target_window, cancel.clone()) {
        Ok(capture) => capture,
        Err(error) => {
            finish_with_error(&app, run_id, activity_lease, error);
            return;
        }
    };
    if let Err(error) = wait_for_initial_detector_states(
        &app,
        run_id,
        target,
        &definition.resources.detectors,
        &snapshot_store,
        &capture_error,
        &cancel,
    ) {
        if let Some(control) = capture_control {
            let _ = control.stop();
        }
        if is_current_run(&app, run_id) {
            finish_with_error(&app, run_id, activity_lease, error);
        }
        return;
    }
    if cancel.load(Ordering::SeqCst) || !mark_running(&app, run_id, activity_lease) {
        if let Some(control) = capture_control {
            let _ = control.stop();
        }
        return;
    }

    let mut clock = RealClock::default();
    let mut input = RuntimeInput {
        target,
        cancel: cancel.clone(),
        action_gate,
    };
    let mut vision = RuntimeVision {
        target,
        snapshots: snapshot_store,
    };
    let mut control = RuntimeControl {
        app: app.clone(),
        run_id,
        cancel,
        last_progress_emit: None,
    };
    let outcome = Interpreter::new(&mut clock, &mut input, &mut vision, &mut control)
        .run(&definition, &ExecutionInputs::default());
    if let Some(control) = capture_control {
        let _ = control.stop();
    }

    let state = app.state::<VisualWorkflow>();
    let (lease, result, log_message) = {
        let mut inner = state.lock();
        if inner.run_id != run_id || inner.activity_lease != Some(activity_lease) {
            return;
        }
        inner.is_running = false;
        inner.current_step_id = None;
        inner.cancel = None;
        let capture_failure = capture_error_message(&capture_error);
        let message = match (capture_failure, outcome) {
            (Some(message), _) => {
                inner.activity = VisualWorkflowActivity::Error;
                inner.last_error = Some(message.clone());
                message
            }
            (None, Ok(report)) if report.status == ExecutionStatus::Succeeded => {
                inner.activity = VisualWorkflowActivity::Completed;
                inner.last_error = None;
                report.message.unwrap_or_else(|| "视觉流程执行完成".into())
            }
            (None, Ok(report)) => {
                let message = report
                    .message
                    .unwrap_or_else(|| "视觉流程以失败状态结束".into());
                inner.activity = VisualWorkflowActivity::Error;
                inner.last_error = Some(message.clone());
                message
            }
            (None, Err(error)) => {
                let message = error.to_string();
                inner.activity = VisualWorkflowActivity::Error;
                inner.last_error = Some(message.clone());
                message
            }
        };
        let lease = inner.activity_lease.take();
        (lease, snapshot(&inner), message)
    };
    release_activity(&app, lease);
    emit_state(&app, &result);
    emit_log(&app, log_message);
}

fn run_countdown(app: &AppHandle, run_id: u64, cancel: &AtomicBool) -> bool {
    for remaining in (1..=START_COUNTDOWN_SECONDS).rev() {
        if cancel.load(Ordering::SeqCst) || !is_current_run(app, run_id) {
            return false;
        }
        let result = {
            let state = app.state::<VisualWorkflow>();
            let mut inner = state.lock();
            if inner.run_id != run_id || !inner.is_running {
                return false;
            }
            inner.countdown_remaining = remaining;
            snapshot(&inner)
        };
        emit_state(app, &result);
        emit_log(app, format!("视觉流程将在 {remaining} 秒后启动"));
        let deadline = Instant::now() + Duration::from_secs(1);
        while Instant::now() < deadline {
            if cancel.load(Ordering::SeqCst) || !is_current_run(app, run_id) {
                return false;
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            thread::sleep(remaining.min(Duration::from_millis(COUNTDOWN_SLICE_MS)));
        }
    }
    true
}

fn is_current_run(app: &AppHandle, run_id: u64) -> bool {
    let state = app.state::<VisualWorkflow>();
    let inner = state.lock();
    inner.run_id == run_id && inner.is_running
}

fn mark_running(app: &AppHandle, run_id: u64, lease: AutomationLease) -> bool {
    let state = app.state::<VisualWorkflow>();
    let result = {
        let mut inner = state.lock();
        if inner.run_id != run_id || inner.activity_lease != Some(lease) || !inner.is_running {
            return false;
        }
        inner.activity = VisualWorkflowActivity::Running;
        inner.countdown_remaining = 0;
        snapshot(&inner)
    };
    emit_state(app, &result);
    emit_log(app, "目标窗口已锁定，开始执行视觉流程");
    true
}

fn wait_for_initial_detector_states(
    app: &AppHandle,
    run_id: u64,
    target: platform::RawWindowHandle,
    detectors: &[DetectorResource],
    snapshots: &capture::DetectorSnapshotStore,
    capture_error: &Arc<Mutex<Option<String>>>,
    cancel: &AtomicBool,
) -> Result<(), String> {
    if detectors.is_empty() {
        return Ok(());
    }
    let waiting_state = {
        let state = app.state::<VisualWorkflow>();
        let mut inner = state.lock();
        if inner.run_id != run_id || !inner.is_running {
            return Err("视觉流程已经停止".into());
        }
        inner.activity = VisualWorkflowActivity::Waiting;
        inner.countdown_remaining = 0;
        snapshot(&inner)
    };
    emit_state(app, &waiting_state);
    emit_log(app, "正在等待识别器首帧确认");

    let deadline = Instant::now() + Duration::from_millis(INITIAL_DETECTOR_TIMEOUT_MS);
    loop {
        if let Some(error) = capture_error_message(capture_error) {
            return Err(error);
        }
        if cancel.load(Ordering::SeqCst) || !is_current_run(app, run_id) {
            return Err("视觉流程已经停止".into());
        }
        if !platform::exists(target) {
            return Err("目标窗口已经关闭".into());
        }
        if platform::minimized(target) {
            return Err("目标窗口已最小化，为避免误操作已停止".into());
        }
        if !platform::foreground(target) {
            return Err("目标窗口不在前台，为避免误操作已停止".into());
        }

        let pending = detectors
            .iter()
            .filter(|detector| snapshots.detector_state(&detector.id) == DetectorState::Unknown)
            .map(|detector| detector.name.as_str())
            .collect::<Vec<_>>();
        if pending.is_empty() {
            emit_log(app, "识别器首帧已确认");
            return Ok(());
        }
        if Instant::now() >= deadline {
            return Err(format!("等待识别器首帧确认超时：{}", pending.join("、")));
        }
        thread::sleep(Duration::from_millis(DETECTOR_WAIT_SLICE_MS));
    }
}

fn capture_error_message(error: &Arc<Mutex<Option<String>>>) -> Option<String> {
    lock_unpoisoned(error).clone()
}

fn finish_with_error(
    app: &AppHandle,
    run_id: u64,
    activity_lease: AutomationLease,
    message: String,
) {
    let state = app.state::<VisualWorkflow>();
    let (lease, result) = {
        let mut inner = state.lock();
        if inner.run_id != run_id || inner.activity_lease != Some(activity_lease) {
            return;
        }
        inner.is_running = false;
        inner.activity = VisualWorkflowActivity::Error;
        inner.countdown_remaining = 0;
        inner.current_step_id = None;
        inner.cancel = None;
        inner.last_error = Some(message.clone());
        let lease = inner.activity_lease.take();
        (lease, snapshot(&inner))
    };
    release_activity(app, lease);
    emit_state(app, &result);
    emit_log(app, message);
}

fn prepare_capture(
    app: &AppHandle,
    definition: &WorkflowDefinition,
    target_window: windows_capture::window::Window,
    cancel: Arc<AtomicBool>,
) -> Result<PreparedCapture, String> {
    let resources = &definition.resources.detectors;
    let store = capture::DetectorSnapshotStore::new(resources);
    let capture_error = Arc::new(Mutex::new(None));
    if resources.is_empty() {
        return Ok(PreparedCapture {
            snapshots: store,
            control: None,
            error: capture_error,
        });
    }
    let directory = app
        .state::<VisualWorkflow>()
        .lock()
        .storage_directory
        .clone();
    let bindings = resources
        .iter()
        .map(|resource| {
            let template = storage::load_template(
                &directory,
                &resource.template.asset_id,
                resource.template.mask_asset_id.as_deref(),
            )?;
            Ok(capture::DetectorBinding {
                resource: resource.clone(),
                template,
            })
        })
        .collect::<Result<Vec<_>, String>>()?;
    let callback_error = capture_error.clone();
    let flags = capture::CaptureFlags::new(bindings, store.clone()).with_termination_callback(
        Arc::new(move |termination| {
            *lock_unpoisoned(&callback_error) = Some(termination.message);
            cancel.store(true, Ordering::SeqCst);
        }),
    );
    let control = capture::start(target_window, flags)?;
    Ok(PreparedCapture {
        snapshots: store,
        control: Some(control),
        error: capture_error,
    })
}

struct RealClock {
    start: Instant,
}

impl Default for RealClock {
    fn default() -> Self {
        Self {
            start: Instant::now(),
        }
    }
}

impl WorkflowClock for RealClock {
    fn now_ms(&self) -> u64 {
        self.start.elapsed().as_millis().min(u128::from(u64::MAX)) as u64
    }

    fn sleep_ms(&mut self, duration_ms: u64) {
        thread::sleep(Duration::from_millis(duration_ms));
    }
}

struct RuntimeInput {
    target: platform::RawWindowHandle,
    cancel: Arc<AtomicBool>,
    action_gate: Arc<Mutex<()>>,
}

impl WorkflowInput for RuntimeInput {
    fn click(
        &mut self,
        point: &PointResource,
        button: MouseButton,
        click_count: u8,
    ) -> Result<(), String> {
        let _gate = lock_unpoisoned(&self.action_gate);
        self.check_target()?;
        let (x, y) = platform::map_point(self.target, point.location)?;
        if matches!(point.location, super::PointLocation::ScreenPhysical { .. })
            && !platform::contains_physical_point(self.target, x, y)?
        {
            return Err("物理屏幕点位不在当前目标窗口范围内，为避免误操作已停止".into());
        }
        input::click_button(x, y, raw_button(button), usize::from(click_count))?;
        self.check_cancelled()
    }

    fn key(&mut self, chord: &KeyChord) -> Result<(), String> {
        let _gate = lock_unpoisoned(&self.action_gate);
        self.check_target()?;
        let (key, modifiers) = parse_key_chord(chord)?;
        if chord.hold_ms == 0 {
            input::key(&key, &modifiers)?;
            return self.check_cancelled();
        }

        let held = input::key_down(&key, &modifiers)?;
        let hold_result = self.wait_key_hold(chord.hold_ms);
        let release_result = input::key_up(held);
        if let Err(error) = hold_result {
            if let Err(release_error) = release_result {
                return Err(format!("{error}；释放按键失败：{release_error}"));
            }
            return Err(error);
        }
        release_result?;
        self.check_cancelled()
    }
}

impl RuntimeInput {
    fn check_cancelled(&self) -> Result<(), String> {
        if self.cancel.load(Ordering::SeqCst) {
            Err("视觉流程已取消".into())
        } else {
            Ok(())
        }
    }

    fn check_target(&self) -> Result<(), String> {
        self.check_cancelled()?;
        if !platform::exists(self.target) {
            return Err("目标窗口已经关闭".into());
        }
        if platform::minimized(self.target) {
            return Err("目标窗口已最小化，为避免误操作已停止".into());
        }
        if !platform::foreground(self.target) {
            return Err("目标窗口不在前台，为避免误操作已停止".into());
        }
        self.check_cancelled()
    }

    fn wait_key_hold(&self, duration_ms: u64) -> Result<(), String> {
        let deadline = Instant::now() + Duration::from_millis(duration_ms);
        loop {
            self.check_target()?;
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                return Ok(());
            }
            thread::sleep(remaining.min(Duration::from_millis(25)));
        }
    }
}

struct RuntimeVision {
    target: platform::RawWindowHandle,
    snapshots: capture::DetectorSnapshotStore,
}

impl WorkflowVision for RuntimeVision {
    fn detector_state(&mut self, detector: &DetectorResource) -> DetectorState {
        self.snapshots.detector_state(&detector.id)
    }

    fn target_state(&mut self, state: TargetState) -> TruthValue {
        let value = match state {
            TargetState::Exists => platform::exists(self.target),
            TargetState::Foreground => platform::foreground(self.target),
            TargetState::Capturable => platform::capturable(self.target),
        };
        if value {
            TruthValue::True
        } else {
            TruthValue::False
        }
    }
}

struct RuntimeControl {
    app: AppHandle,
    run_id: u64,
    cancel: Arc<AtomicBool>,
    last_progress_emit: Option<Instant>,
}

impl ExecutionControl for RuntimeControl {
    fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    fn on_event(&mut self, event: &ExecutionEvent) {
        let should_emit_progress = event.kind == ExecutionEventKind::StepStarted
            && self.last_progress_emit.is_none_or(|last| {
                last.elapsed() >= Duration::from_millis(PROGRESS_MIN_INTERVAL_MS)
            });
        let state = self.app.state::<VisualWorkflow>();
        let progress = {
            let mut inner = state.lock();
            if inner.run_id != self.run_id || !inner.is_running {
                return;
            }
            if event.kind == ExecutionEventKind::StepStarted {
                inner.current_step_id = event.step_id.clone();
                inner.activity = VisualWorkflowActivity::Running;
            }
            should_emit_progress.then(|| progress(&inner))
        };
        if let Some(progress) = progress {
            self.last_progress_emit = Some(Instant::now());
            emit_progress(&self.app, &progress);
        }
        if event.kind == ExecutionEventKind::Log
            && let Some(message) = &event.message
        {
            emit_log(&self.app, message.clone());
        }
    }
}

fn parse_key_chord(chord: &KeyChord) -> Result<(String, Vec<KeyModifier>), String> {
    let mut modifiers = Vec::new();
    let mut main_key = None;
    for raw in &chord.keys {
        let trimmed = raw.trim();
        let modifier = if trimmed.eq_ignore_ascii_case("ctrl")
            || trimmed.eq_ignore_ascii_case("control")
            || trimmed.eq_ignore_ascii_case("commandorcontrol")
        {
            Some(KeyModifier::Control)
        } else if trimmed.eq_ignore_ascii_case("alt") {
            Some(KeyModifier::Alt)
        } else if trimmed.eq_ignore_ascii_case("shift") {
            Some(KeyModifier::Shift)
        } else {
            None
        };
        if let Some(modifier) = modifier {
            if !modifiers.contains(&modifier) {
                modifiers.push(modifier);
            }
        } else if main_key.replace(normalize_key(trimmed)).is_some() {
            return Err("组合键目前只允许一个主按键和 Ctrl/Alt/Shift 修饰键".into());
        }
    }
    let main_key = main_key.ok_or_else(|| "组合键缺少主按键".to_string())?;
    Ok((main_key, modifiers))
}

fn claim_activity(app: &AppHandle) -> Result<AutomationLease, String> {
    app.state::<AppState>()
        .lock()
        .automation_activity
        .claim(AutomationModule::VisualWorkflow)
        .ok_or_else(|| "其他自动化功能正在运行，请先停止后再启动视觉流程".into())
}

fn release_activity(app: &AppHandle, lease: Option<AutomationLease>) {
    if let Some(lease) = lease {
        app.state::<AppState>()
            .lock()
            .automation_activity
            .release(lease);
    }
}

fn encode_preview_png(
    image: &crate::buff_assistant::capture::CapturedImage,
) -> Result<Vec<u8>, String> {
    let rgba = RgbaImage::from_raw(image.width, image.height, image.rgba.clone())
        .ok_or_else(|| "视觉流程捕获画面像素格式无效".to_string())?;
    let mut bytes = Cursor::new(Vec::new());
    DynamicImage::ImageRgba8(rgba)
        .write_to(&mut bytes, image::ImageFormat::Png)
        .map_err(|error| format!("编码视觉流程预览 PNG 失败：{error}"))?;
    Ok(bytes.into_inner())
}

fn crop_template_from_preview(
    preview: &DynamicImage,
    search_region: NormalizedRegion,
    crop: NormalizedRegion,
) -> Result<DynamicImage, String> {
    let (region_x, region_y, region_end_x, region_end_y) =
        capture::normalized_region_pixel_bounds(search_region, preview.width(), preview.height())?;
    let region = preview.crop_imm(
        region_x,
        region_y,
        region_end_x - region_x,
        region_end_y - region_y,
    );
    let (x, y, end_x, end_y) =
        capture::normalized_region_pixel_bounds(crop, region.width(), region.height())?;
    let width = end_x - x;
    let height = end_y - y;
    if width < 4 || height < 4 {
        return Err("视觉流程模板区域过小，宽高至少为 4 像素".into());
    }
    Ok(region.crop_imm(x, y, width, height))
}

fn decode_strict_mask(
    data_url: Option<&str>,
    width: u32,
    height: u32,
) -> Result<Option<GrayImage>, String> {
    let Some(data_url) = data_url else {
        return Ok(None);
    };
    if data_url.len() > MAX_MASK_DATA_URL_BYTES {
        return Err("视觉流程模板遮罩过大".into());
    }
    let encoded = data_url
        .strip_prefix("data:image/png;base64,")
        .ok_or_else(|| "视觉流程模板遮罩必须是 PNG data URL".to_string())?;
    if encoded.is_empty() {
        return Err("视觉流程模板遮罩内容为空".into());
    }
    let bytes = BASE64
        .decode(encoded)
        .map_err(|error| format!("解析视觉流程模板遮罩失败：{error}"))?;
    let mask = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png)
        .map_err(|error| format!("读取视觉流程模板遮罩失败：{error}"))?
        .into_luma8();
    if mask.dimensions() != (width, height) {
        return Err(format!(
            "视觉流程模板遮罩尺寸必须与模板一致，期望 {width}×{height}，实际 {}×{}",
            mask.width(),
            mask.height()
        ));
    }
    Ok(Some(mask))
}

fn validate_detector_id(detector_id: &str) -> Result<(), String> {
    if detector_id.is_empty() || detector_id.trim() != detector_id {
        return Err("视觉流程识别器 ID 不能为空或包含首尾空白".into());
    }
    Ok(())
}

fn ensure_unique_detector(
    definition: &WorkflowDefinition,
    detector_id: &str,
) -> Result<(), String> {
    validate_detector_id(detector_id)?;
    let count = definition
        .resources
        .detectors
        .iter()
        .filter(|detector| detector.id == detector_id)
        .count();
    match count {
        0 => Err(format!("找不到视觉流程识别器 '{detector_id}'")),
        1 => Ok(()),
        _ => Err(format!("视觉流程识别器 ID '{detector_id}' 重复")),
    }
}

fn unique_detector_mut<'a>(
    definition: &'a mut WorkflowDefinition,
    detector_id: &str,
) -> Result<&'a mut DetectorResource, String> {
    ensure_unique_detector(definition, detector_id)?;
    definition
        .resources
        .detectors
        .iter_mut()
        .find(|detector| detector.id == detector_id)
        .ok_or_else(|| format!("找不到视觉流程识别器 '{detector_id}'"))
}

fn unique_template_asset_id() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let sequence = TEMPLATE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("detector-{timestamp}-{sequence}")
}

fn referenced_assets(template: &DetectorTemplateRef) -> BTreeSet<String> {
    let mut assets = BTreeSet::new();
    if !template.asset_id.is_empty() {
        assets.insert(template.asset_id.clone());
    }
    if let Some(mask_asset_id) = &template.mask_asset_id
        && !mask_asset_id.is_empty()
    {
        assets.insert(mask_asset_id.clone());
    }
    assets
}

fn delete_unreferenced_assets(
    directory: &std::path::Path,
    candidates: BTreeSet<String>,
    definition: &WorkflowDefinition,
) -> Vec<String> {
    unreferenced_asset_ids(candidates, definition)
        .into_iter()
        .filter_map(|asset_id| {
            storage::delete_template(directory, &asset_id)
                .err()
                .map(|error| format!("清理旧视觉流程模板 '{asset_id}' 失败：{error}"))
        })
        .collect()
}

fn unreferenced_asset_ids(
    candidates: BTreeSet<String>,
    definition: &WorkflowDefinition,
) -> BTreeSet<String> {
    let retained = definition
        .resources
        .detectors
        .iter()
        .flat_map(|detector| referenced_assets(&detector.template))
        .collect::<BTreeSet<_>>();
    candidates.difference(&retained).cloned().collect()
}

fn ensure_not_running(inner: &RuntimeData) -> Result<(), String> {
    if inner.is_running {
        Err("视觉流程正在运行，请先停止".into())
    } else {
        Ok(())
    }
}

fn snapshot(inner: &RuntimeData) -> VisualWorkflowState {
    VisualWorkflowState {
        run_id: inner.run_id,
        definition: inner.definition.clone(),
        activity: inner.activity,
        is_running: inner.is_running,
        countdown_remaining: inner.countdown_remaining,
        current_step_id: inner.current_step_id.clone(),
        diagnostics: inner.diagnostics.clone(),
        last_error: inner.last_error.clone(),
    }
}

fn progress(inner: &RuntimeData) -> VisualWorkflowProgress {
    VisualWorkflowProgress {
        run_id: inner.run_id,
        activity: inner.activity,
        is_running: inner.is_running,
        countdown_remaining: inner.countdown_remaining,
        current_step_id: inner.current_step_id.clone(),
    }
}

fn emit_state(app: &AppHandle, state: &VisualWorkflowState) {
    let _ = app.emit(STATE_EVENT, state);
}

fn emit_progress(app: &AppHandle, progress: &VisualWorkflowProgress) {
    let _ = app.emit(PROGRESS_EVENT, progress);
}

fn emit_log(app: &AppHandle, message: impl Into<String>) {
    let _ = app.emit(LOG_EVENT, message.into());
}

fn lock_unpoisoned<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn raw_button(button: MouseButton) -> RawMouseButton {
    match button {
        MouseButton::Left => RawMouseButton::Left,
        MouseButton::Right => RawMouseButton::Right,
        MouseButton::Middle => RawMouseButton::Middle,
    }
}

fn workflow_target_from_buff(target: &BuffTarget) -> WorkflowTarget {
    WorkflowTarget {
        process_name: target.process_name.clone(),
        window_title: target.window_title.clone(),
        class_name: target.class_name.clone(),
        reference_width: target.reference_width,
        reference_height: target.reference_height,
    }
}

fn buff_target_from_workflow(target: &WorkflowTarget) -> BuffTarget {
    BuffTarget {
        process_name: target.process_name.clone(),
        window_title: target.window_title.clone(),
        class_name: target.class_name.clone(),
        reference_width: target.reference_width,
        reference_height: target.reference_height,
    }
}

fn find_exact_target(
    target: &BuffTarget,
) -> Result<Option<windows_capture::window::Window>, String> {
    let candidate =
        select_exact_target_candidate(target, capture_windows::enumerate_candidates()?)?;
    candidate
        .map(|candidate| capture_windows::resolve_window(&candidate.id).map(|(window, _)| window))
        .transpose()
}

fn select_exact_target_candidate(
    target: &BuffTarget,
    candidates: Vec<CaptureWindowCandidate>,
) -> Result<Option<CaptureWindowCandidate>, String> {
    if target.process_name.trim().is_empty()
        || target.window_title.trim().is_empty()
        || target.class_name.trim().is_empty()
    {
        return Err("目标窗口身份信息不完整，请重新捕获并绑定目标窗口".into());
    }

    let mut matches = candidates.into_iter().filter(|candidate| {
        candidate
            .process_name
            .eq_ignore_ascii_case(&target.process_name)
            && candidate
                .window_title
                .eq_ignore_ascii_case(&target.window_title)
            && candidate
                .class_name
                .eq_ignore_ascii_case(&target.class_name)
    });
    let candidate = matches.next();
    if matches.next().is_some() {
        return Err("匹配到多个相同的目标窗口，为避免误操作，请关闭多余窗口后重新启动流程".into());
    }
    Ok(candidate)
}

fn default_definition() -> WorkflowDefinition {
    WorkflowDefinition {
        schema_version: WORKFLOW_SCHEMA_VERSION,
        id: "visual-workflow-default".into(),
        name: "未命名视觉流程".into(),
        description: None,
        target: None,
        resources: WorkflowResources::default(),
        safety_guards: Vec::new(),
        root: WorkflowStep {
            id: "root".into(),
            label: Some("主流程".into()),
            enabled: true,
            node: WorkflowNode::Sequence { steps: Vec::new() },
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn detector(id: &str, asset_id: &str, mask_asset_id: Option<&str>) -> DetectorResource {
        DetectorResource {
            id: id.into(),
            name: id.into(),
            search_region: NormalizedRegion {
                x: 0.0,
                y: 0.0,
                width: 1.0,
                height: 1.0,
            },
            template: DetectorTemplateRef {
                asset_id: asset_id.into(),
                mask_asset_id: mask_asset_id.map(str::to_string),
                width: 10,
                height: 10,
                capture_reference_width: 100,
                capture_reference_height: 100,
            },
            match_threshold: 0.9,
            confirm_frames: 1,
            missing_frames: 1,
            stale_after_ms: 500,
        }
    }

    #[test]
    fn key_chord_splits_modifiers_from_main_key() {
        let chord = KeyChord {
            keys: vec!["Ctrl".into(), "Shift".into(), "f".into()],
            hold_ms: 0,
        };
        assert_eq!(
            parse_key_chord(&chord),
            Ok(("F".into(), vec![KeyModifier::Control, KeyModifier::Shift]))
        );
    }

    #[test]
    fn key_chord_rejects_multiple_main_keys() {
        let chord = KeyChord {
            keys: vec!["A".into(), "B".into()],
            hold_ms: 0,
        };
        assert!(parse_key_chord(&chord).is_err());
    }

    #[test]
    fn old_assets_are_retained_while_another_detector_references_them() {
        let mut definition = default_definition();
        definition.resources.detectors = vec![
            detector("first", "new", None),
            detector("second", "shared-image", Some("shared-mask")),
        ];
        let candidates = BTreeSet::from([
            "shared-image".to_string(),
            "shared-mask".to_string(),
            "unused".to_string(),
        ]);
        assert_eq!(
            unreferenced_asset_ids(candidates, &definition),
            BTreeSet::from(["unused".to_string()])
        );
    }

    #[test]
    fn template_crop_is_relative_to_search_region() {
        let preview = DynamicImage::new_rgba8(200, 100);
        let template = crop_template_from_preview(
            &preview,
            NormalizedRegion {
                x: 0.25,
                y: 0.2,
                width: 0.5,
                height: 0.5,
            },
            NormalizedRegion {
                x: 0.1,
                y: 0.2,
                width: 0.4,
                height: 0.6,
            },
        )
        .unwrap();
        assert_eq!((template.width(), template.height()), (40, 30));
    }

    #[test]
    fn exact_target_selection_rejects_ambiguous_windows() {
        let target = BuffTarget {
            process_name: "game.exe".into(),
            window_title: "Game".into(),
            class_name: "GameWindow".into(),
            reference_width: 1_280,
            reference_height: 720,
        };
        let candidate = CaptureWindowCandidate {
            id: "1".into(),
            process_name: target.process_name.clone(),
            window_title: target.window_title.clone(),
            class_name: target.class_name.clone(),
            width: 1_280,
            height: 720,
        };

        let error =
            select_exact_target_candidate(&target, vec![candidate.clone(), candidate]).unwrap_err();
        assert!(error.contains("多个相同的目标窗口"));
    }

    #[test]
    fn exact_target_selection_requires_complete_identity() {
        let target = BuffTarget {
            process_name: "game.exe".into(),
            window_title: String::new(),
            class_name: "GameWindow".into(),
            reference_width: 1_280,
            reference_height: 720,
        };

        let error = select_exact_target_candidate(&target, Vec::new()).unwrap_err();
        assert!(error.contains("身份信息不完整"));
    }
}
