use crate::model::{KeyModifier, virtual_key_code};

#[cfg(target_os = "windows")]
mod platform {
    use std::{io, mem::size_of};

    use windows_sys::Win32::{
        Foundation::POINT,
        UI::{
            HiDpi::{DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2, SetProcessDpiAwarenessContext},
            Input::KeyboardAndMouse::{
                INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY,
                KEYEVENTF_KEYUP, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEINPUT, SendInput,
            },
            WindowsAndMessaging::{GetCursorPos, SetCursorPos},
        },
    };

    use super::{KeyModifier, virtual_key_code};

    pub fn enable_per_monitor_dpi_awareness() {
        // Tauri normally configures this through its Windows manifest. Calling it here also keeps
        // cursor coordinates physical if the executable is launched without that manifest in dev.
        // Windows returns failure when awareness was already configured, which is safe to ignore.
        unsafe {
            let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        }
    }

    pub fn get_cursor_position() -> Result<(i32, i32), String> {
        let mut point = POINT::default();
        let ok = unsafe { GetCursorPos(&mut point) };
        if ok == 0 {
            Err(last_error("GetCursorPos"))
        } else {
            Ok((point.x, point.y))
        }
    }

    pub fn click(x: i32, y: i32) -> Result<(), String> {
        mouse_click(x, y, 1)
    }

    pub fn double_click(x: i32, y: i32) -> Result<(), String> {
        mouse_click(x, y, 2)
    }

    pub fn key(key: &str, modifiers: &[KeyModifier]) -> Result<(), String> {
        let key_code = virtual_key_code(key).ok_or_else(|| format!("不支持的按键：{key}"))?;
        let modifier_codes = modifiers
            .iter()
            .map(|modifier| match modifier {
                KeyModifier::Control => 0x11,
                KeyModifier::Alt => 0x12,
                KeyModifier::Shift => 0x10,
            })
            .collect::<Vec<u16>>();
        let mut codes = modifier_codes;
        codes.push(key_code);

        let mut inputs = Vec::with_capacity(codes.len() * 2);
        for code in &codes {
            inputs.push(keyboard_input(*code, false));
        }
        for code in codes.iter().rev() {
            inputs.push(keyboard_input(*code, true));
        }
        if let Err(error) = send_inputs(&inputs) {
            // SendInput may have accepted only a prefix (for example, modifiers but not the main
            // key). Best-effort releases avoid leaving Ctrl/Alt/Shift logically held down.
            let releases = codes
                .iter()
                .rev()
                .map(|code| keyboard_input(*code, true))
                .collect::<Vec<_>>();
            send_inputs_best_effort(&releases);
            Err(error)
        } else {
            Ok(())
        }
    }

    fn mouse_input(flags: u32) -> INPUT {
        INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dwFlags: flags,
                    ..Default::default()
                },
            },
        }
    }

    fn mouse_click(x: i32, y: i32, click_count: usize) -> Result<(), String> {
        perform_mouse_click(
            x,
            y,
            click_count,
            set_cursor_position,
            send_inputs,
            send_inputs_best_effort,
        )
    }

    fn perform_mouse_click<SetCursor, Send, Release>(
        x: i32,
        y: i32,
        click_count: usize,
        set_cursor: SetCursor,
        send: Send,
        release: Release,
    ) -> Result<(), String>
    where
        SetCursor: FnOnce(i32, i32) -> Result<(), String>,
        Send: FnOnce(&[INPUT]) -> Result<(), String>,
        Release: FnOnce(&[INPUT]),
    {
        set_cursor(x, y)?;
        let inputs = mouse_click_inputs(click_count);
        if let Err(error) = send(&inputs) {
            // A partial SendInput may stop after LEFTDOWN. A best-effort release avoids leaving
            // the primary mouse button logically held down.
            release(&[mouse_input(MOUSEEVENTF_LEFTUP)]);
            Err(error)
        } else {
            Ok(())
        }
    }

    fn mouse_click_inputs(click_count: usize) -> Vec<INPUT> {
        let mut inputs = Vec::with_capacity(click_count * 2);
        for _ in 0..click_count {
            inputs.push(mouse_input(MOUSEEVENTF_LEFTDOWN));
            inputs.push(mouse_input(MOUSEEVENTF_LEFTUP));
        }
        inputs
    }

    fn set_cursor_position(x: i32, y: i32) -> Result<(), String> {
        if unsafe { SetCursorPos(x, y) } == 0 {
            Err(last_error("SetCursorPos"))
        } else {
            Ok(())
        }
    }

    fn keyboard_input(code: u16, key_up: bool) -> INPUT {
        let mut flags = if is_extended_key(code) {
            KEYEVENTF_EXTENDEDKEY
        } else {
            0
        };
        if key_up {
            flags |= KEYEVENTF_KEYUP;
        }
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: code,
                    dwFlags: flags,
                    ..Default::default()
                },
            },
        }
    }

    fn is_extended_key(code: u16) -> bool {
        matches!(
            code,
            0x21 | 0x22 | 0x23 | 0x24 | 0x25 | 0x26 | 0x27 | 0x28 | 0x2d | 0x2e
        )
    }

    fn send_inputs(inputs: &[INPUT]) -> Result<(), String> {
        let sent = unsafe {
            SendInput(
                inputs.len() as u32,
                inputs.as_ptr(),
                size_of::<INPUT>() as i32,
            )
        };
        if sent == inputs.len() as u32 {
            Ok(())
        } else {
            Err(format!(
                "SendInput 仅发送了 {sent}/{} 个输入：{}；可能受管理员权限/UIPI 限制",
                inputs.len(),
                io::Error::last_os_error()
            ))
        }
    }

    fn send_inputs_best_effort(inputs: &[INPUT]) {
        unsafe {
            let _ = SendInput(
                inputs.len() as u32,
                inputs.as_ptr(),
                size_of::<INPUT>() as i32,
            );
        }
    }

    fn last_error(operation: &str) -> String {
        format!("{operation} 失败：{}", io::Error::last_os_error())
    }

    #[cfg(test)]
    mod tests {
        use std::cell::RefCell;

        use super::*;

        fn mouse_flags(inputs: &[INPUT]) -> Vec<u32> {
            inputs
                .iter()
                .map(|input| unsafe { input.Anonymous.mi.dwFlags })
                .collect()
        }

        #[test]
        fn single_click_positions_once_and_sends_two_events() {
            let positions = RefCell::new(Vec::new());
            let batches = RefCell::new(Vec::new());
            perform_mouse_click(
                -120,
                45,
                1,
                |x, y| {
                    positions.borrow_mut().push((x, y));
                    Ok(())
                },
                |inputs| {
                    batches.borrow_mut().push(mouse_flags(inputs));
                    Ok(())
                },
                |_| panic!("successful click must not send a recovery release"),
            )
            .expect("single click succeeds");

            assert_eq!(*positions.borrow(), vec![(-120, 45)]);
            assert_eq!(
                *batches.borrow(),
                vec![vec![MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP]]
            );
        }

        #[test]
        fn double_click_positions_once_and_sends_four_events_in_one_batch() {
            let positions = RefCell::new(Vec::new());
            let batches = RefCell::new(Vec::new());
            perform_mouse_click(
                -800,
                -200,
                2,
                |x, y| {
                    positions.borrow_mut().push((x, y));
                    Ok(())
                },
                |inputs| {
                    batches.borrow_mut().push(mouse_flags(inputs));
                    Ok(())
                },
                |_| panic!("successful double-click must not send a recovery release"),
            )
            .expect("double-click succeeds");

            assert_eq!(*positions.borrow(), vec![(-800, -200)]);
            assert_eq!(
                *batches.borrow(),
                vec![vec![
                    MOUSEEVENTF_LEFTDOWN,
                    MOUSEEVENTF_LEFTUP,
                    MOUSEEVENTF_LEFTDOWN,
                    MOUSEEVENTF_LEFTUP,
                ]]
            );
        }

        #[test]
        fn partial_send_failure_triggers_best_effort_left_button_release() {
            let releases = RefCell::new(Vec::new());
            let result = perform_mouse_click(
                10,
                20,
                2,
                |_, _| Ok(()),
                |_| Err("partial SendInput".into()),
                |inputs| releases.borrow_mut().push(mouse_flags(inputs)),
            );

            assert_eq!(result, Err("partial SendInput".into()));
            assert_eq!(*releases.borrow(), vec![vec![MOUSEEVENTF_LEFTUP]]);
        }
    }
}

#[cfg(not(target_os = "windows"))]
mod platform {
    use super::KeyModifier;

    pub fn enable_per_monitor_dpi_awareness() {}

    pub fn get_cursor_position() -> Result<(i32, i32), String> {
        Err("当前平台暂不支持读取全局鼠标坐标".into())
    }

    pub fn click(_x: i32, _y: i32) -> Result<(), String> {
        Err("当前平台暂不支持模拟鼠标点击".into())
    }

    pub fn double_click(_x: i32, _y: i32) -> Result<(), String> {
        Err("当前平台暂不支持模拟鼠标双击".into())
    }

    pub fn key(_key: &str, _modifiers: &[KeyModifier]) -> Result<(), String> {
        Err("当前平台暂不支持模拟键盘输入".into())
    }
}

pub use platform::{
    click, double_click, enable_per_monitor_dpi_awareness, get_cursor_position, key,
};
