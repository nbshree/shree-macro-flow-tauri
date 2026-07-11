use std::{
    path::PathBuf,
    sync::{Mutex, MutexGuard},
};

use chrono::Local;
use tauri::{AppHandle, Emitter};

use crate::{
    model::{
        AppearancePreferences, MacroState, PersistedData, profile_summaries, state_from_store,
    },
    store,
};

pub struct RuntimeData {
    pub state: MacroState,
    pub store: PersistedData,
    pub run_token: u64,
    pub is_capturing_key: bool,
    pub is_quitting: bool,
    pub profile_file: PathBuf,
}

pub struct AppState {
    inner: Mutex<RuntimeData>,
}

impl AppState {
    pub fn new(profile_file: PathBuf, mut profile_store: PersistedData) -> Self {
        let state = state_from_store(&mut profile_store);
        Self {
            inner: Mutex::new(RuntimeData {
                state,
                store: profile_store,
                run_token: 0,
                is_capturing_key: false,
                is_quitting: false,
                profile_file,
            }),
        }
    }

    pub fn lock(&self) -> MutexGuard<'_, RuntimeData> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub fn snapshot(&self) -> MacroState {
        self.lock().state.clone()
    }

    pub fn log(&self, app: &AppHandle, message: impl Into<String>) -> MacroState {
        let snapshot = {
            let mut inner = self.lock();
            push_log(&mut inner.state, message.into());
            inner.state.clone()
        };
        emit_state(app, &snapshot);
        snapshot
    }

    pub fn replace_hotkey_errors(&self, app: &AppHandle, errors: Vec<String>) -> MacroState {
        let snapshot = {
            let mut inner = self.lock();
            inner.state.hotkey_errors = errors.clone();
            for error in errors {
                push_log(&mut inner.state, error);
            }
            inner.state.clone()
        };
        emit_state(app, &snapshot);
        snapshot
    }

    pub fn persist_store(&self, app: &AppHandle, store: PersistedData, path: PathBuf) {
        if let Err(error) = store::save_profiles(&path, &store) {
            self.log(app, error);
        }
    }

    pub fn persist_current_store(&self, app: &AppHandle) {
        let (store, path) = {
            let inner = self.lock();
            (inner.store.clone(), inner.profile_file.clone())
        };
        self.persist_store(app, store, path);
    }

    pub fn save_active_profile(&self, app: &AppHandle) {
        let (store, path) = {
            let mut inner = self.lock();
            sync_active_profile(&mut inner);
            (inner.store.clone(), inner.profile_file.clone())
        };
        self.persist_store(app, store, path);
    }
}

pub fn emit_state(app: &AppHandle, state: &MacroState) {
    let _ = app.emit("macro-state", state);
}

pub fn push_log(state: &mut MacroState, message: String) {
    let time = Local::now().format("%H:%M:%S");
    state.logs.insert(0, format!("{time} {message}"));
    state.logs.truncate(150);
}

pub fn can_edit_flow(inner: &RuntimeData) -> bool {
    !inner.state.is_running && !inner.state.is_recording
}

pub fn sync_active_profile(inner: &mut RuntimeData) {
    if let Some(profile) = inner
        .store
        .profiles
        .iter_mut()
        .find(|profile| profile.id == inner.state.active_profile_id)
    {
        profile.points = inner.state.points.clone();
        profile.settings = inner.state.settings.clone();
        profile.updated_at = crate::model::now_millis();
    }
    apply_active_profile(inner);
}

pub fn apply_active_profile(inner: &mut RuntimeData) {
    if inner.store.profiles.is_empty() {
        inner.store = crate::model::create_default_profile_store();
    }
    let active_index = inner
        .store
        .profiles
        .iter()
        .position(|profile| profile.id == inner.store.active_profile_id)
        .unwrap_or(0);
    let active = &inner.store.profiles[active_index];
    inner.store.active_profile_id = active.id.clone();
    inner.state.active_profile_id = active.id.clone();
    inner.state.points = active.points.clone();
    inner.state.settings = active.settings.clone();
    inner.state.appearance = inner.store.appearance.clone();
    inner.state.profiles = profile_summaries(&inner.store);
}

pub fn apply_appearance(inner: &mut RuntimeData, appearance: AppearancePreferences) {
    inner.store.appearance = appearance.clone();
    inner.state.appearance = appearance;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{AppearancePreferences, create_default_profile_store, state_from_store};

    #[test]
    fn applying_appearance_does_not_touch_profile_or_runtime_state() {
        let mut store = create_default_profile_store();
        store.profiles[0].updated_at = 1234;
        let mut state = state_from_store(&mut store);
        state.is_running = true;
        state.is_recording = true;
        state.logs.push("existing log".into());
        let mut runtime = RuntimeData {
            state,
            store,
            run_token: 42,
            is_capturing_key: true,
            is_quitting: false,
            profile_file: PathBuf::from("unused.json"),
        };

        apply_appearance(
            &mut runtime,
            AppearancePreferences {
                theme_id: "default".into(),
                clean_mode: true,
            },
        );

        assert_eq!(runtime.store.profiles[0].updated_at, 1234);
        assert_eq!(runtime.state.appearance, runtime.store.appearance);
        assert_eq!(runtime.state.appearance.theme_id, "default");
        assert!(runtime.state.appearance.clean_mode);
        assert!(runtime.state.is_running);
        assert!(runtime.state.is_recording);
        assert_eq!(runtime.state.logs, ["existing log"]);
        assert_eq!(runtime.run_token, 42);
        assert!(runtime.is_capturing_key);
    }
}
