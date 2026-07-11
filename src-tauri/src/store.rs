use std::{
    env, fs,
    path::{Path, PathBuf},
};

use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::model::{
    PROFILE_FILE_NAME, PersistedData, create_default_profile_store, sanitize_persisted,
};

pub struct LoadResult {
    pub store: PersistedData,
    pub notices: Vec<String>,
}

pub fn profile_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(PROFILE_FILE_NAME))
        .map_err(|error| format!("无法确定配置目录：{error}"))
}

pub fn load_profiles(profile_file: &Path) -> LoadResult {
    let mut notices = Vec::new();
    let source = if profile_file.exists() {
        Some(profile_file.to_path_buf())
    } else {
        legacy_profile_paths(profile_file)
            .into_iter()
            .find(|path| path.exists())
    };

    let Some(source) = source else {
        return LoadResult {
            store: create_default_profile_store(),
            notices,
        };
    };

    let store = match fs::read_to_string(&source)
        .map_err(|error| error.to_string())
        .and_then(|contents| {
            serde_json::from_str::<Value>(&contents).map_err(|error| error.to_string())
        }) {
        Ok(value) => sanitize_persisted(&value),
        Err(error) => {
            notices.push(format!("配置文件读取失败，已使用默认方案：{error}"));
            create_default_profile_store()
        }
    };

    if source != profile_file {
        notices.push("已迁移 Electron 旧版方案配置".into());
    }

    LoadResult { store, notices }
}

pub fn save_profiles(path: &Path, store: &PersistedData) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("创建配置目录失败：{error}"))?;
    }
    let mut json = serde_json::to_string_pretty(store)
        .map_err(|error| format!("序列化方案配置失败：{error}"))?;
    json.push('\n');
    fs::write(path, json).map_err(|error| format!("保存方案配置失败：{error}"))
}

pub fn write_profile(path: &Path, profile: &crate::model::MacroProfile) -> Result<(), String> {
    let mut json = serde_json::to_string_pretty(profile)
        .map_err(|error| format!("序列化导出方案失败：{error}"))?;
    json.push('\n');
    fs::write(path, json).map_err(|error| format!("写入导出文件失败：{error}"))
}

pub fn read_json(path: &Path) -> Result<Value, String> {
    let contents = fs::read_to_string(path).map_err(|error| format!("读取文件失败：{error}"))?;
    serde_json::from_str(&contents).map_err(|error| format!("JSON 解析失败：{error}"))
}

fn legacy_profile_paths(current: &Path) -> Vec<PathBuf> {
    let Some(app_data) = env::var_os("APPDATA").map(PathBuf::from) else {
        return Vec::new();
    };
    ["macro-flow", "自动点击流程台"]
        .into_iter()
        .map(|directory| app_data.join(directory).join(PROFILE_FILE_NAME))
        .filter(|path| path != current)
        .collect()
}
