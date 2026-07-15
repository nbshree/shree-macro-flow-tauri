mod commands;
mod desktop;
mod input;
mod internal_skill_ai;
mod model;
mod shortcuts;
mod state;
mod store;

use std::io;

use tauri::{Manager, RunEvent, WindowEvent};

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    input::enable_per_monitor_dpi_awareness();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            desktop::show_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let profile_file = store::profile_file_path(app.handle()).map_err(io::Error::other)?;
            let loaded = store::load_profiles(&profile_file);
            let notices = loaded.notices;
            app.manage(AppState::new(profile_file, loaded.store));

            let state = app.state::<AppState>();
            state.persist_current_store(app.handle());
            desktop::create_tray(app.handle())?;
            shortcuts::register_shortcuts(app.handle());
            for notice in notices {
                state.log(app.handle(), notice);
            }
            state.log(app.handle(), "应用已启动");
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                let is_quitting = app.state::<AppState>().lock().is_quitting;
                if !is_quitting {
                    api.prevent_close();
                    let _ = window.hide();
                    app.state::<AppState>().log(app, "窗口已最小化到托盘");
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::update_appearance,
            commands::start_recording,
            commands::stop_recording,
            commands::start_run,
            commands::stop_run,
            commands::clear_logs,
            commands::remove_point,
            commands::clear_points,
            commands::add_key_point,
            commands::set_key_capture,
            commands::sync_point_delays,
            commands::update_point,
            commands::move_point,
            commands::reorder_point,
            commands::test_point,
            commands::update_settings,
            commands::create_profile,
            commands::switch_profile,
            commands::rename_profile,
            commands::delete_profile,
            commands::export_profile,
            commands::import_profile,
            internal_skill_ai::get_mystery_code_status,
            internal_skill_ai::open_ai_provider_registration,
            internal_skill_ai::save_and_validate_mystery_code,
            internal_skill_ai::delete_mystery_code,
            internal_skill_ai::recognize_internal_skill_image,
        ])
        .build(tauri::generate_context!())
        .expect("error while building Tauri application");

    app.run(|app, event| match event {
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => desktop::show_main_window(app),
        RunEvent::Exit => shortcuts::unregister_all(app),
        _ => {}
    });
}
