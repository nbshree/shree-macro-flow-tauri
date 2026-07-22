use serde::{Deserialize, Serialize};
use std::{
    sync::atomic::{AtomicBool, AtomicU64, Ordering},
    time::{Duration, Instant},
};

static CAPTURE_ENABLED: AtomicBool = AtomicBool::new(false);
static DROPPED_EVENTS: AtomicU64 = AtomicU64::new(0);
static IN_FLIGHT_SENDERS: AtomicU64 = AtomicU64::new(0);
static ENQUEUED_EVENTS: AtomicU64 = AtomicU64::new(0);
static PROCESSED_EVENTS: AtomicU64 = AtomicU64::new(0);
static CAPTURE_GENERATION: AtomicU64 = AtomicU64::new(0);
static LISTENER_ALIVE: AtomicBool = AtomicBool::new(false);

pub fn is_listener_alive() -> bool {
    LISTENER_ALIVE.load(Ordering::Acquire)
}

fn mark_capture_drop() {
    if CAPTURE_ENABLED.load(Ordering::Acquire) {
        DROPPED_EVENTS.fetch_add(1, Ordering::Relaxed);
    }
}

pub struct CaptureCutoff {
    pub captured_at: Instant,
    target_processed: u64,
}

pub fn begin_capture() {
    DROPPED_EVENTS.store(0, Ordering::Release);
    CAPTURE_GENERATION.fetch_add(1, Ordering::AcqRel);
    CAPTURE_ENABLED.store(true, Ordering::Release);
}

pub fn end_capture() -> CaptureCutoff {
    if let Some(cutoff) = platform::capture_stop_barrier() {
        return cutoff;
    }
    CAPTURE_ENABLED.store(false, Ordering::Release);
    while IN_FLIGHT_SENDERS.load(Ordering::Acquire) != 0 {
        std::thread::yield_now();
    }
    CaptureCutoff {
        captured_at: Instant::now(),
        target_processed: ENQUEUED_EVENTS.load(Ordering::Acquire),
    }
}

pub fn wait_until_drained(cutoff: &CaptureCutoff, timeout: Duration) -> bool {
    let started = Instant::now();
    while PROCESSED_EVENTS.load(Ordering::Acquire) < cutoff.target_processed {
        if started.elapsed() >= timeout {
            return false;
        }
        std::thread::sleep(Duration::from_millis(1));
    }
    true
}

pub fn has_dropped_events() -> bool {
    DROPPED_EVENTS.load(Ordering::Acquire) != 0
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RawMouseButton {
    Left,
    Right,
    Middle,
}

#[derive(Clone, Copy, Debug)]
pub struct RawInputEvent {
    pub captured_at: Instant,
    pub kind: RawInputKind,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RawInputKind {
    MouseMove {
        dx: i32,
        dy: i32,
    },
    MouseButton {
        button: RawMouseButton,
        pressed: bool,
    },
    MouseWheel {
        delta: i16,
    },
    Key {
        scan_code: u16,
        extended: bool,
        pressed: bool,
    },
}

#[cfg(target_os = "windows")]
mod platform {
    use std::{
        ffi::c_void,
        mem::size_of,
        ptr::{null, null_mut},
        sync::{Condvar, Mutex, OnceLock, mpsc},
        thread,
        time::Duration,
    };

    use windows_sys::Win32::{
        Foundation::{HWND, LPARAM, LRESULT, WPARAM},
        System::LibraryLoader::GetModuleHandleW,
        UI::{
            Input::{
                GetRawInputData, RAWINPUT, RAWINPUTDEVICE, RAWINPUTHEADER, RID_INPUT,
                RIDEV_INPUTSINK, RIM_TYPEKEYBOARD, RIM_TYPEMOUSE, RegisterRawInputDevices,
            },
            WindowsAndMessaging::{
                CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, HWND_MESSAGE, MSG,
                PM_REMOVE, PeekMessageW, PostMessageW, RI_KEY_BREAK, RI_KEY_E0, RI_KEY_E1,
                RI_MOUSE_LEFT_BUTTON_DOWN, RI_MOUSE_LEFT_BUTTON_UP, RI_MOUSE_MIDDLE_BUTTON_DOWN,
                RI_MOUSE_MIDDLE_BUTTON_UP, RI_MOUSE_RIGHT_BUTTON_DOWN, RI_MOUSE_RIGHT_BUTTON_UP,
                RI_MOUSE_WHEEL, RegisterClassW, WM_APP, WM_INPUT, WNDCLASSW,
            },
        },
    };

    use super::{CaptureCutoff, RawInputEvent, RawInputKind, RawMouseButton};
    use crate::input::GAME_INPUT_EXTRA_INFO;

    type EventSender = mpsc::SyncSender<RawInputEvent>;
    static RAW_INPUT_SENDER: OnceLock<Mutex<Option<EventSender>>> = OnceLock::new();
    static RAW_INPUT_WINDOW: std::sync::atomic::AtomicIsize =
        std::sync::atomic::AtomicIsize::new(0);
    static STOP_REQUEST: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    static STOP_SERIALIZER: Mutex<()> = Mutex::new(());
    static STOP_ACK: OnceLock<(Mutex<StopAck>, Condvar)> = OnceLock::new();
    const WM_CAPTURE_STOP: u32 = WM_APP + 0x431;

    struct StopAck {
        request: u64,
        cutoff: Option<CaptureCutoff>,
    }

    pub fn start_listener<F>(handler: F) -> Result<(), String>
    where
        F: Fn(RawInputEvent) + Send + 'static,
    {
        let (event_tx, event_rx) = mpsc::sync_channel(8192);
        let sender = RAW_INPUT_SENDER.get_or_init(|| Mutex::new(None));
        *sender
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(event_tx);

        thread::spawn(move || {
            while let Ok(event) = event_rx.recv() {
                handler(event);
                super::PROCESSED_EVENTS.fetch_add(1, std::sync::atomic::Ordering::Release);
            }
        });

        let (ready_tx, ready_rx) = mpsc::sync_channel(1);
        thread::spawn(move || run_message_window(ready_tx));
        ready_rx
            .recv_timeout(Duration::from_secs(3))
            .map_err(|_| "Raw Input 接收窗口启动超时".to_string())?
    }

    fn run_message_window(ready: mpsc::SyncSender<Result<(), String>>) {
        RAW_INPUT_WINDOW.store(0, std::sync::atomic::Ordering::Release);
        super::LISTENER_ALIVE.store(false, std::sync::atomic::Ordering::Release);
        let class_name = wide("ShreeMacroFlowRawInputWindow");
        let instance = unsafe { GetModuleHandleW(null()) };
        if instance.is_null() {
            let _ = ready.send(Err(last_error("GetModuleHandleW")));
            return;
        }

        let window_class = WNDCLASSW {
            lpfnWndProc: Some(window_proc),
            hInstance: instance,
            lpszClassName: class_name.as_ptr(),
            ..Default::default()
        };
        if unsafe { RegisterClassW(&window_class) } == 0 {
            let _ = ready.send(Err(last_error("RegisterClassW")));
            return;
        }

        let window = unsafe {
            CreateWindowExW(
                0,
                class_name.as_ptr(),
                class_name.as_ptr(),
                0,
                0,
                0,
                0,
                0,
                HWND_MESSAGE,
                null_mut(),
                instance,
                null(),
            )
        };
        if window.is_null() {
            let _ = ready.send(Err(last_error("CreateWindowExW")));
            return;
        }
        RAW_INPUT_WINDOW.store(window as isize, std::sync::atomic::Ordering::Release);

        // Raw Input allows only one target per usage in a process. Register this receiver exactly
        // once for the full application lifetime. Do not use RIDEV_NOLEGACY (Tauri still needs
        // ordinary window input), and do not remove/re-register devices between recordings.
        let devices = [
            RAWINPUTDEVICE {
                usUsagePage: 0x01,
                usUsage: 0x02,
                dwFlags: RIDEV_INPUTSINK,
                hwndTarget: window,
            },
            RAWINPUTDEVICE {
                usUsagePage: 0x01,
                usUsage: 0x06,
                dwFlags: RIDEV_INPUTSINK,
                hwndTarget: window,
            },
        ];
        if unsafe {
            RegisterRawInputDevices(
                devices.as_ptr(),
                devices.len() as u32,
                size_of::<RAWINPUTDEVICE>() as u32,
            )
        } == 0
        {
            RAW_INPUT_WINDOW.store(0, std::sync::atomic::Ordering::Release);
            let _ = ready.send(Err(last_error("RegisterRawInputDevices")));
            return;
        }
        super::LISTENER_ALIVE.store(true, std::sync::atomic::Ordering::Release);
        let _ = ready.send(Ok(()));

        let mut message = MSG::default();
        while unsafe { GetMessageW(&mut message, null_mut(), 0, 0) } > 0 {
            unsafe {
                DispatchMessageW(&message);
            }
        }
        RAW_INPUT_WINDOW.store(0, std::sync::atomic::Ordering::Release);
        super::LISTENER_ALIVE.store(false, std::sync::atomic::Ordering::Release);
        super::mark_capture_drop();
        if let Some(sender) = RAW_INPUT_SENDER.get() {
            *sender
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = None;
        }
    }

    unsafe extern "system" fn window_proc(
        window: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if message == WM_INPUT {
            read_input(lparam as _);
        } else if message == WM_CAPTURE_STOP {
            complete_capture_stop(wparam as u64, lparam as u64);
            return 0;
        }
        unsafe { DefWindowProcW(window, message, wparam, lparam) }
    }

    fn read_input(handle: *mut c_void) {
        let mut size = size_of::<RAWINPUT>() as u32;
        let mut input = RAWINPUT::default();
        let read = unsafe {
            GetRawInputData(
                handle,
                RID_INPUT,
                (&mut input as *mut RAWINPUT).cast(),
                &mut size,
                size_of::<RAWINPUTHEADER>() as u32,
            )
        };
        if read == u32::MAX || read == 0 || size > size_of::<RAWINPUT>() as u32 {
            super::mark_capture_drop();
            return;
        }

        match input.header.dwType {
            RIM_TYPEMOUSE => {
                let mouse = unsafe { input.data.mouse };
                let buttons = unsafe { mouse.Anonymous.Anonymous };
                for kind in parse_mouse_kinds(
                    mouse.usFlags as u32,
                    buttons.usButtonFlags as u32,
                    buttons.usButtonData,
                    mouse.lLastX,
                    mouse.lLastY,
                    mouse.ulExtraInformation,
                ) {
                    send(kind);
                }
            }
            RIM_TYPEKEYBOARD => {
                let keyboard = unsafe { input.data.keyboard };
                if let Some(kind) = parse_keyboard_kind(
                    keyboard.MakeCode,
                    keyboard.Flags as u32,
                    keyboard.VKey,
                    keyboard.ExtraInformation,
                ) {
                    send(kind);
                }
            }
            _ => {}
        }
    }

    fn parse_mouse_kinds(
        mouse_flags: u32,
        button_flags: u32,
        button_data: u16,
        dx: i32,
        dy: i32,
        extra_information: u32,
    ) -> Vec<RawInputKind> {
        if extra_information == GAME_INPUT_EXTRA_INFO as u32 {
            return Vec::new();
        }
        let mut kinds = Vec::with_capacity(4);
        if mouse_flags & 0x01 == 0 && (dx != 0 || dy != 0) {
            kinds.push(RawInputKind::MouseMove { dx, dy });
        }
        for (flag, button, pressed) in [
            (RI_MOUSE_LEFT_BUTTON_DOWN, RawMouseButton::Left, true),
            (RI_MOUSE_LEFT_BUTTON_UP, RawMouseButton::Left, false),
            (RI_MOUSE_RIGHT_BUTTON_DOWN, RawMouseButton::Right, true),
            (RI_MOUSE_RIGHT_BUTTON_UP, RawMouseButton::Right, false),
            (RI_MOUSE_MIDDLE_BUTTON_DOWN, RawMouseButton::Middle, true),
            (RI_MOUSE_MIDDLE_BUTTON_UP, RawMouseButton::Middle, false),
        ] {
            if button_flags & flag != 0 {
                kinds.push(RawInputKind::MouseButton { button, pressed });
            }
        }
        if button_flags & RI_MOUSE_WHEEL != 0 {
            kinds.push(RawInputKind::MouseWheel {
                delta: button_data as i16,
            });
        }
        kinds
    }

    fn parse_keyboard_kind(
        scan_code: u16,
        flags: u32,
        virtual_key: u16,
        extra_information: u32,
    ) -> Option<RawInputKind> {
        if extra_information == GAME_INPUT_EXTRA_INFO as u32
            || virtual_key == 0xff
            || scan_code == 0
            || flags & RI_KEY_E1 != 0
        {
            return None;
        }
        Some(RawInputKind::Key {
            scan_code,
            extended: flags & RI_KEY_E0 != 0,
            pressed: flags & RI_KEY_BREAK == 0,
        })
    }

    fn send(kind: RawInputKind) {
        super::IN_FLIGHT_SENDERS.fetch_add(1, std::sync::atomic::Ordering::AcqRel);
        if !super::CAPTURE_ENABLED.load(std::sync::atomic::Ordering::Acquire) {
            super::IN_FLIGHT_SENDERS.fetch_sub(1, std::sync::atomic::Ordering::AcqRel);
            return;
        }
        let Some(sender) = RAW_INPUT_SENDER.get() else {
            super::mark_capture_drop();
            super::IN_FLIGHT_SENDERS.fetch_sub(1, std::sync::atomic::Ordering::AcqRel);
            return;
        };
        if let Some(sender) = sender
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .as_ref()
        {
            match sender.try_send(RawInputEvent {
                captured_at: std::time::Instant::now(),
                kind,
            }) {
                Ok(()) => {
                    super::ENQUEUED_EVENTS.fetch_add(1, std::sync::atomic::Ordering::Release);
                }
                Err(mpsc::TrySendError::Full(_)) => {
                    super::DROPPED_EVENTS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                }
                Err(mpsc::TrySendError::Disconnected(_)) => super::mark_capture_drop(),
            }
        } else {
            super::mark_capture_drop();
        }
        super::IN_FLIGHT_SENDERS.fetch_sub(1, std::sync::atomic::Ordering::AcqRel);
    }

    pub fn capture_stop_barrier() -> Option<CaptureCutoff> {
        let _serialized = STOP_SERIALIZER
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let window = RAW_INPUT_WINDOW.load(std::sync::atomic::Ordering::Acquire) as HWND;
        if window.is_null() {
            return None;
        }
        let request = STOP_REQUEST.fetch_add(1, std::sync::atomic::Ordering::AcqRel) + 1;
        let generation = super::CAPTURE_GENERATION.load(std::sync::atomic::Ordering::Acquire);
        if unsafe {
            PostMessageW(
                window,
                WM_CAPTURE_STOP,
                request as usize,
                generation as isize,
            )
        } == 0
        {
            return None;
        }
        let (state, changed) = STOP_ACK.get_or_init(|| {
            (
                Mutex::new(StopAck {
                    request: 0,
                    cutoff: None,
                }),
                Condvar::new(),
            )
        });
        let state = state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let (mut state, timeout) = changed
            .wait_timeout_while(state, Duration::from_millis(500), |state| {
                state.request < request
            })
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if timeout.timed_out() || state.request != request {
            None
        } else {
            state.cutoff.take()
        }
    }

    fn complete_capture_stop(request: u64, generation: u64) {
        if super::CAPTURE_GENERATION.load(std::sync::atomic::Ordering::Acquire) != generation {
            acknowledge_capture_stop(request, None);
            return;
        }
        // Posted messages may be selected before raw hardware messages. Drain the receiver
        // thread's currently queued WM_INPUT messages explicitly, then close the capture gate.
        let mut message = MSG::default();
        while unsafe { PeekMessageW(&mut message, null_mut(), WM_INPUT, WM_INPUT, PM_REMOVE) } != 0
        {
            unsafe {
                DispatchMessageW(&message);
            }
        }
        if super::CAPTURE_GENERATION.load(std::sync::atomic::Ordering::Acquire) != generation {
            acknowledge_capture_stop(request, None);
            return;
        }
        super::CAPTURE_ENABLED.store(false, std::sync::atomic::Ordering::Release);
        let cutoff = CaptureCutoff {
            captured_at: std::time::Instant::now(),
            target_processed: super::ENQUEUED_EVENTS.load(std::sync::atomic::Ordering::Acquire),
        };
        acknowledge_capture_stop(request, Some(cutoff));
    }

    fn acknowledge_capture_stop(request: u64, cutoff: Option<CaptureCutoff>) {
        let (state, changed) = STOP_ACK.get_or_init(|| {
            (
                Mutex::new(StopAck {
                    request: 0,
                    cutoff: None,
                }),
                Condvar::new(),
            )
        });
        let mut state = state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if update_stop_ack(&mut state, request, cutoff) {
            changed.notify_all();
        }
    }

    fn update_stop_ack(state: &mut StopAck, request: u64, cutoff: Option<CaptureCutoff>) -> bool {
        if request <= state.request {
            return false;
        }
        state.request = request;
        state.cutoff = cutoff;
        true
    }

    fn wide(value: &str) -> Vec<u16> {
        value.encode_utf16().chain(Some(0)).collect()
    }

    fn last_error(operation: &str) -> String {
        format!("{operation} 失败：{}", std::io::Error::last_os_error())
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn mouse_parser_keeps_relative_movement_buttons_and_wheel() {
            assert_eq!(
                parse_mouse_kinds(0, 0, 0, 12, -7, 0),
                vec![RawInputKind::MouseMove { dx: 12, dy: -7 }]
            );
            assert_eq!(
                parse_mouse_kinds(
                    0,
                    RI_MOUSE_LEFT_BUTTON_DOWN | RI_MOUSE_RIGHT_BUTTON_UP,
                    0,
                    0,
                    0,
                    0,
                ),
                vec![
                    RawInputKind::MouseButton {
                        button: RawMouseButton::Left,
                        pressed: true,
                    },
                    RawInputKind::MouseButton {
                        button: RawMouseButton::Right,
                        pressed: false,
                    },
                ]
            );
            assert_eq!(
                parse_mouse_kinds(0, RI_MOUSE_WHEEL, (-120i16) as u16, 0, 0, 0),
                vec![RawInputKind::MouseWheel { delta: -120 }]
            );
        }

        #[test]
        fn mouse_parser_ignores_absolute_and_injected_movement() {
            assert!(parse_mouse_kinds(0x01, 0, 0, 12, 7, 0).is_empty());
            assert!(parse_mouse_kinds(0, 0, 0, 12, 7, GAME_INPUT_EXTRA_INFO as u32).is_empty());
        }

        #[test]
        fn keyboard_parser_handles_break_and_e0_and_ignores_e1_or_injected() {
            assert_eq!(
                parse_keyboard_kind(0x1d, RI_KEY_E0, 0xA3, 0),
                Some(RawInputKind::Key {
                    scan_code: 0x1d,
                    extended: true,
                    pressed: true,
                })
            );
            assert_eq!(
                parse_keyboard_kind(0x1d, RI_KEY_E0 | RI_KEY_BREAK, 0xA3, 0),
                Some(RawInputKind::Key {
                    scan_code: 0x1d,
                    extended: true,
                    pressed: false,
                })
            );
            assert!(parse_keyboard_kind(0x45, RI_KEY_E1, 0x13, 0).is_none());
            assert!(parse_keyboard_kind(0x1e, 0, 0x41, GAME_INPUT_EXTRA_INFO as u32).is_none());
        }

        #[test]
        fn stale_stop_ack_cannot_overwrite_a_newer_request() {
            let mut state = StopAck {
                request: 2,
                cutoff: None,
            };
            assert!(!update_stop_ack(&mut state, 1, None));
            assert_eq!(state.request, 2);
            assert!(update_stop_ack(&mut state, 3, None));
            assert_eq!(state.request, 3);
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    use super::{CaptureCutoff, RawInputEvent};

    pub fn start_listener<F>(_handler: F) -> Result<(), String>
    where
        F: Fn(RawInputEvent) + Send + 'static,
    {
        Err("游戏操作录制仅支持 Windows".into())
    }

    pub fn capture_stop_barrier() -> Option<CaptureCutoff> {
        None
    }
}

pub use platform::start_listener;
