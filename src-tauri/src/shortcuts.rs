use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

use crate::{
    commands::{capture_point_internal, start_run_internal, stop_run_internal},
    model::EMERGENCY_STOP_HOTKEY,
    state::AppState,
};

pub fn register_shortcuts(app: &AppHandle) {
    let hotkeys = app
        .state::<AppState>()
        .lock()
        .state
        .settings
        .hotkeys
        .clone();
    let manager = app.global_shortcut();
    let mut errors = Vec::new();

    if let Err(error) = manager.unregister_all() {
        errors.push(format!("清理旧热键失败：{error}"));
    }

    if let Err(error) = manager.on_shortcut(EMERGENCY_STOP_HOTKEY, |app, _, event| {
        if event.state == ShortcutState::Pressed {
            stop_run_internal(app);
        }
    }) {
        errors.push(format!(
            "热键注册失败：紧急停止 {EMERGENCY_STOP_HOTKEY}（{error}）"
        ));
    }

    register_one(
        app,
        &hotkeys.capture,
        "采集坐标",
        |app| {
            capture_point_internal(app);
        },
        &mut errors,
    );
    register_one(
        app,
        &hotkeys.start,
        "开始执行",
        |app| {
            start_run_internal(app);
        },
        &mut errors,
    );
    register_one(
        app,
        &hotkeys.stop,
        "停止执行",
        |app| {
            stop_run_internal(app);
        },
        &mut errors,
    );

    app.state::<AppState>().replace_hotkey_errors(app, errors);
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
    }
}

fn is_capturing_key(app: &AppHandle) -> bool {
    app.state::<AppState>().lock().is_capturing_key
}
