use std::sync::{Mutex, OnceLock};

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::{
    buff_assistant,
    commands::{
        capture_point_internal, start_run_internal, stop_macro_workspace_activity_internal,
    },
    desktop::{ShortcutKind, Workspace, WorkspaceState, start_visual_workflow_internal},
    game_recorder::{
        self, GameRecorder, start_game_playback_internal, start_game_recording_internal,
        stop_game_activity_from_hotkey,
    },
    model::EMERGENCY_STOP_HOTKEY,
    state::AppState,
    trade_assistant, visual_workflow,
};

static MODULE_SHORTCUTS: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
pub(crate) const VISUAL_WORKFLOW_START_HOTKEY: &str = "CommandOrControl+Alt+I";
pub(crate) const VISUAL_WORKFLOW_STOP_HOTKEY: &str = "CommandOrControl+Alt+U";

pub fn register_shortcuts(app: &AppHandle) -> bool {
    let workspace = app.state::<WorkspaceState>().active();
    let manager = app.global_shortcut();
    let mut errors = Vec::new();

    let registered = MODULE_SHORTCUTS.get_or_init(|| Mutex::new(Vec::new()));
    let mut registered = registered
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    for accelerator in registered.drain(..) {
        if manager.is_registered(accelerator.as_str())
            && let Err(error) = manager.unregister(accelerator.as_str())
        {
            errors.push(format!("清理旧热键 {accelerator} 失败：{error}"));
        }
    }

    if !manager.is_registered(EMERGENCY_STOP_HOTKEY)
        && let Err(error) = manager.on_shortcut(EMERGENCY_STOP_HOTKEY, |app, _, event| {
            if event.state == ShortcutState::Pressed {
                stop_macro_workspace_activity_internal(app);
                stop_game_activity_from_hotkey(app, EMERGENCY_STOP_HOTKEY);
                buff_assistant::stop_buff_monitor_internal(app);
                trade_assistant::stop_internal(app, "紧急停止交易行助手");
                visual_workflow::runtime::stop_internal(app, "紧急停止视觉流程");
            }
        })
    {
        errors.push(format!(
            "热键注册失败：紧急停止 {EMERGENCY_STOP_HOTKEY}（{error}）"
        ));
    }

    match workspace.shortcut_kind() {
        ShortcutKind::Macro => register_macro_shortcuts(app, &mut errors, &mut registered),
        ShortcutKind::GameRecorder => register_game_shortcuts(app, &mut errors, &mut registered),
        ShortcutKind::TradeAssistant => register_trade_shortcuts(app, &mut errors, &mut registered),
        ShortcutKind::VisualWorkflow => {
            register_visual_workflow_shortcuts(app, &mut errors, &mut registered)
        }
        ShortcutKind::None => {}
    }

    let succeeded = errors.is_empty();
    match workspace {
        Workspace::Macro => {
            app.state::<AppState>().replace_hotkey_errors(app, errors);
        }
        Workspace::GameRecorder => {
            app.state::<GameRecorder>()
                .replace_hotkey_errors(app, errors);
        }
        Workspace::BuffAssistant
        | Workspace::TradeAssistant
        | Workspace::VisualWorkflow
        | Workspace::Calculator
        | Workspace::TowerCalculator => {
            for error in errors {
                app.state::<AppState>().log(app, error);
            }
        }
    }
    succeeded
}

fn register_visual_workflow_shortcuts(
    app: &AppHandle,
    errors: &mut Vec<String>,
    registered: &mut Vec<String>,
) {
    register_one(
        app,
        VISUAL_WORKFLOW_START_HOTKEY,
        "开始视觉流程",
        start_visual_workflow_internal,
        errors,
        registered,
    );
    register_one(
        app,
        VISUAL_WORKFLOW_STOP_HOTKEY,
        "停止视觉流程",
        |app| {
            visual_workflow::runtime::stop_internal(app, "通过热键停止视觉流程");
        },
        errors,
        registered,
    );
}

fn register_trade_shortcuts(
    app: &AppHandle,
    errors: &mut Vec<String>,
    registered: &mut Vec<String>,
) {
    let hotkeys = trade_assistant::hotkeys(app);
    register_one(
        app,
        &hotkeys.capture,
        "采集交易坐标",
        |app| {
            if let Err(error) = trade_assistant::capture_coordinate_internal(app) {
                trade_assistant::report_action_error(app, error);
            }
        },
        errors,
        registered,
    );
    register_one(
        app,
        &hotkeys.start,
        "开始交易行抢购",
        |app| {
            if let Err(error) = trade_assistant::start_internal(app) {
                trade_assistant::report_action_error(app, error);
            }
        },
        errors,
        registered,
    );
    register_one(
        app,
        &hotkeys.stop,
        "停止交易行抢购",
        |app| {
            trade_assistant::stop_internal(app, "通过热键停止交易行助手");
        },
        errors,
        registered,
    );
}

fn register_macro_shortcuts(
    app: &AppHandle,
    errors: &mut Vec<String>,
    registered: &mut Vec<String>,
) {
    let hotkeys = app
        .state::<AppState>()
        .lock()
        .state
        .settings
        .hotkeys
        .clone();
    register_one(
        app,
        &hotkeys.capture,
        "采集坐标",
        |app| {
            capture_point_internal(app);
        },
        errors,
        registered,
    );
    register_one(
        app,
        &hotkeys.start,
        "开始执行",
        |app| {
            start_run_internal(app);
        },
        errors,
        registered,
    );
    register_one(
        app,
        &hotkeys.stop,
        "停止执行",
        |app| {
            stop_macro_workspace_activity_internal(app);
        },
        errors,
        registered,
    );
}

fn register_game_shortcuts(
    app: &AppHandle,
    errors: &mut Vec<String>,
    registered: &mut Vec<String>,
) {
    let hotkeys = game_recorder::hotkeys(app);
    register_one(
        app,
        &hotkeys.record_start,
        "开始游戏录制",
        |app| {
            let _ = start_game_recording_internal(app);
        },
        errors,
        registered,
    );
    register_one(
        app,
        &hotkeys.stop,
        "停止游戏任务",
        |app| {
            let accelerator = game_recorder::hotkeys(app).stop;
            stop_game_activity_from_hotkey(app, &accelerator);
        },
        errors,
        registered,
    );
    register_one(
        app,
        &hotkeys.playback_start,
        "开始游戏回放",
        |app| {
            let _ = start_game_playback_internal(app, false);
        },
        errors,
        registered,
    );
}

pub fn unregister_all(app: &AppHandle) {
    let _ = app.global_shortcut().unregister_all();
}

fn register_one<F>(
    app: &AppHandle,
    accelerator: &str,
    label: &str,
    handler: F,
    errors: &mut Vec<String>,
    registered: &mut Vec<String>,
) where
    F: Fn(&AppHandle) + Send + Sync + 'static,
{
    let accelerator_owned = accelerator.to_owned();
    if let Err(error) = app
        .global_shortcut()
        .on_shortcut(accelerator, move |app, _, event| {
            if event.state != ShortcutState::Pressed || is_capturing_key(app) {
                return;
            }
            handler(app);
        })
    {
        errors.push(format!(
            "热键注册失败：{label} {accelerator_owned}（{error}）"
        ));
    } else {
        registered.push(accelerator_owned);
    }
}

fn is_capturing_key(app: &AppHandle) -> bool {
    app.state::<AppState>().lock().is_capturing_key
}
