use std::sync::{Mutex, MutexGuard};

use serde::Serialize;
use tauri::{AppHandle, Manager, State, ipc::Channel};
use tauri_plugin_updater::{Update, UpdaterExt};
use time::format_description::well_known::Rfc3339;

use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateCheckResult {
    current_version: String,
    update: Option<AppUpdateInfo>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateInfo {
    version: String,
    notes: String,
    published_at: Option<String>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AppUpdateErrorCode {
    CheckFailed,
    MetadataFailed,
    NoPendingUpdate,
    InstallInProgress,
    MacroBusy,
    DownloadFailed,
    InstallFailed,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateError {
    code: AppUpdateErrorCode,
    message: String,
}

impl AppUpdateError {
    fn new(code: AppUpdateErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AppUpdateDownloadEventKind {
    Started,
    Progress,
    Finished,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUpdateDownloadEvent {
    event: AppUpdateDownloadEventKind,
    downloaded: u64,
    total: Option<u64>,
}

enum PendingState<T> {
    Empty,
    Available(T),
    Installing,
}

pub type PendingUpdate = PendingUpdateState<Update>;

pub struct PendingUpdateState<T> {
    inner: Mutex<PendingState<T>>,
}

impl<T> Default for PendingUpdateState<T> {
    fn default() -> Self {
        Self {
            inner: Mutex::new(PendingState::Empty),
        }
    }
}

impl<T> PendingUpdateState<T> {
    fn lock(&self) -> MutexGuard<'_, PendingState<T>> {
        self.inner
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    fn replace(&self, update: Option<T>) -> Result<(), AppUpdateError> {
        let mut state = self.lock();
        if matches!(*state, PendingState::Installing) {
            return Err(install_in_progress_error());
        }
        *state = match update {
            Some(update) => PendingState::Available(update),
            None => PendingState::Empty,
        };
        Ok(())
    }

    fn begin_install(&self) -> Result<T, AppUpdateError> {
        let mut state = self.lock();
        match std::mem::replace(&mut *state, PendingState::Installing) {
            PendingState::Available(update) => Ok(update),
            PendingState::Empty => {
                *state = PendingState::Empty;
                Err(AppUpdateError::new(
                    AppUpdateErrorCode::NoPendingUpdate,
                    "没有可安装的更新，请先检查更新。",
                ))
            }
            PendingState::Installing => {
                *state = PendingState::Installing;
                Err(install_in_progress_error())
            }
        }
    }

    fn restore_after_failure(&self, update: T) {
        let mut state = self.lock();
        if matches!(*state, PendingState::Installing) {
            *state = PendingState::Available(update);
        }
    }

    fn finish_install(&self) {
        let mut state = self.lock();
        if matches!(*state, PendingState::Installing) {
            *state = PendingState::Empty;
        }
    }
}

#[tauri::command]
pub async fn check_for_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
) -> Result<AppUpdateCheckResult, AppUpdateError> {
    let current_version = app.package_info().version.to_string();
    let update = app
        .updater()
        .map_err(|error| check_error(error.to_string()))?
        .check()
        .await
        .map_err(|error| check_error(error.to_string()))?;

    let info = update.as_ref().map(update_info).transpose()?;
    pending.replace(update)?;

    Ok(AppUpdateCheckResult {
        current_version,
        update: info,
    })
}

#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    pending: State<'_, PendingUpdate>,
    on_event: Channel<AppUpdateDownloadEvent>,
) -> Result<(), AppUpdateError> {
    ensure_macro_idle(&app)?;
    let update = pending.begin_install()?;

    match download_and_install(&app, &update, &on_event).await {
        Ok(()) => {
            pending.finish_install();
            Ok(())
        }
        Err(error) => {
            pending.restore_after_failure(update);
            Err(error)
        }
    }
}

async fn download_and_install(
    app: &AppHandle,
    update: &Update,
    on_event: &Channel<AppUpdateDownloadEvent>,
) -> Result<(), AppUpdateError> {
    let progress = Mutex::new(DownloadProgress::default());
    send_download_event(on_event, AppUpdateDownloadEventKind::Started, 0, None);

    let bytes = update
        .download(
            |chunk_length, content_length| {
                let (downloaded, total) = {
                    let mut progress = progress
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    if content_length.is_some() {
                        progress.total = content_length;
                    }
                    progress.downloaded = progress.downloaded.saturating_add(chunk_length as u64);
                    (progress.downloaded, progress.total)
                };
                send_download_event(
                    on_event,
                    AppUpdateDownloadEventKind::Progress,
                    downloaded,
                    total,
                );
            },
            || {},
        )
        .await
        .map_err(|error| {
            AppUpdateError::new(
                AppUpdateErrorCode::DownloadFailed,
                format!("更新下载或签名校验失败：{error}"),
            )
        })?;

    let progress = progress
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    send_download_event(
        on_event,
        AppUpdateDownloadEventKind::Finished,
        progress.downloaded,
        progress.total,
    );
    drop(progress);

    install_when_macro_idle(app, update, bytes)
}

fn install_when_macro_idle(
    app: &AppHandle,
    update: &Update,
    bytes: Vec<u8>,
) -> Result<(), AppUpdateError> {
    // 下载期间用户仍可能通过全局热键启动宏。保持运行状态锁直到安装器接管，
    // 避免宏在最终检查与当前进程退出之间抢跑。
    let state = app.state::<AppState>();
    let inner = state.lock();
    macro_idle_result(
        inner.state.is_running,
        inner.state.is_recording,
        inner.game_activity,
    )?;

    update.install(bytes).map_err(|error| {
        AppUpdateError::new(
            AppUpdateErrorCode::InstallFailed,
            format!("启动更新安装程序失败：{error}"),
        )
    })
}

#[derive(Default)]
struct DownloadProgress {
    downloaded: u64,
    total: Option<u64>,
}

fn update_info(update: &Update) -> Result<AppUpdateInfo, AppUpdateError> {
    let published_at = update
        .date
        .map(|date| date.format(&Rfc3339))
        .transpose()
        .map_err(|error| {
            AppUpdateError::new(
                AppUpdateErrorCode::MetadataFailed,
                format!("更新发布日期格式无效：{error}"),
            )
        })?;

    Ok(update_info_from_parts(
        update.version.clone(),
        update.body.as_deref(),
        published_at,
    ))
}

fn update_info_from_parts(
    version: String,
    notes: Option<&str>,
    published_at: Option<String>,
) -> AppUpdateInfo {
    AppUpdateInfo {
        version,
        notes: notes.map(str::trim).unwrap_or_default().to_string(),
        published_at,
    }
}

fn ensure_macro_idle(app: &AppHandle) -> Result<(), AppUpdateError> {
    let state = app.state::<AppState>();
    let inner = state.lock();
    macro_idle_result(
        inner.state.is_running,
        inner.state.is_recording,
        inner.game_activity,
    )
}

fn macro_idle_result(
    is_running: bool,
    is_recording: bool,
    game_activity: bool,
) -> Result<(), AppUpdateError> {
    if is_recording {
        Err(AppUpdateError::new(
            AppUpdateErrorCode::MacroBusy,
            "录制期间不能安装更新，请先停止录制。",
        ))
    } else if is_running {
        Err(AppUpdateError::new(
            AppUpdateErrorCode::MacroBusy,
            "宏正在执行，不能安装更新，请先停止执行。",
        ))
    } else if game_activity {
        Err(AppUpdateError::new(
            AppUpdateErrorCode::MacroBusy,
            "游戏录制或回放正在进行，不能安装更新，请先停止当前任务。",
        ))
    } else {
        Ok(())
    }
}

fn send_download_event(
    channel: &Channel<AppUpdateDownloadEvent>,
    event: AppUpdateDownloadEventKind,
    downloaded: u64,
    total: Option<u64>,
) {
    let _ = channel.send(AppUpdateDownloadEvent {
        event,
        downloaded,
        total,
    });
}

fn check_error(details: String) -> AppUpdateError {
    AppUpdateError::new(
        AppUpdateErrorCode::CheckFailed,
        format!("无法获取更新信息：{details}"),
    )
}

fn install_in_progress_error() -> AppUpdateError {
    AppUpdateError::new(
        AppUpdateErrorCode::InstallInProgress,
        "更新已在下载或安装中，请勿重复操作。",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_metadata_uses_camel_case_and_plain_text_notes() {
        let info = update_info_from_parts(
            "1.8.0".into(),
            Some("\n  修复更新检查问题。\n  "),
            Some("2026-07-21T10:30:00Z".into()),
        );
        let serialized = serde_json::to_value(info).expect("serialize update info");

        assert_eq!(serialized["version"], "1.8.0");
        assert_eq!(serialized["notes"], "修复更新检查问题。");
        assert_eq!(serialized["publishedAt"], "2026-07-21T10:30:00Z");
    }

    #[test]
    fn missing_update_notes_become_an_empty_string() {
        let info = update_info_from_parts("1.8.0".into(), None, None);
        let serialized = serde_json::to_value(info).expect("serialize update info");

        assert_eq!(serialized["notes"], "");
        assert!(serialized["publishedAt"].is_null());
    }

    #[test]
    fn download_events_and_errors_use_the_frontend_contract() {
        let event = AppUpdateDownloadEvent {
            event: AppUpdateDownloadEventKind::Progress,
            downloaded: 512,
            total: Some(1024),
        };
        assert_eq!(
            serde_json::to_value(event).expect("serialize download event"),
            serde_json::json!({
                "event": "progress",
                "downloaded": 512,
                "total": 1024,
            })
        );

        let error = install_in_progress_error();
        assert_eq!(
            serde_json::to_value(error).expect("serialize update error"),
            serde_json::json!({
                "code": "installInProgress",
                "message": "更新已在下载或安装中，请勿重复操作。",
            })
        );
    }

    #[test]
    fn pending_update_can_be_retried_after_failure() {
        let pending = PendingUpdateState::<String>::default();
        pending
            .replace(Some("v1.8.0".into()))
            .expect("store pending update");

        let update = pending.begin_install().expect("begin install");
        assert_eq!(update, "v1.8.0");
        assert_eq!(
            pending
                .begin_install()
                .expect_err("reject duplicate install")
                .code,
            AppUpdateErrorCode::InstallInProgress
        );

        pending.restore_after_failure(update);
        assert_eq!(pending.begin_install().expect("retry install"), "v1.8.0");
        pending.finish_install();
        assert_eq!(
            pending
                .begin_install()
                .expect_err("pending update consumed")
                .code,
            AppUpdateErrorCode::NoPendingUpdate
        );
    }

    #[test]
    fn checking_cannot_replace_an_update_being_installed() {
        let pending = PendingUpdateState::<u32>::default();
        pending.replace(Some(180)).expect("store pending update");
        assert_eq!(pending.begin_install().expect("begin install"), 180);

        assert_eq!(
            pending
                .replace(Some(181))
                .expect_err("do not replace installing update")
                .code,
            AppUpdateErrorCode::InstallInProgress
        );
    }

    #[test]
    fn running_or_recording_macros_block_installation() {
        assert!(macro_idle_result(false, false, false).is_ok());
        assert_eq!(
            macro_idle_result(true, false, false)
                .expect_err("running must be blocked")
                .code,
            AppUpdateErrorCode::MacroBusy
        );
        assert_eq!(
            macro_idle_result(false, true, false)
                .expect_err("recording must be blocked")
                .code,
            AppUpdateErrorCode::MacroBusy
        );
        assert_eq!(
            macro_idle_result(false, false, true)
                .expect_err("game activity must be blocked")
                .code,
            AppUpdateErrorCode::MacroBusy
        );
    }
}
