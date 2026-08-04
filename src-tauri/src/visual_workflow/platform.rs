use windows_capture::window::Window;
use windows_sys::Win32::{
    Foundation::{HWND, RECT},
    System::Threading::GetCurrentProcessId,
    UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowRect, GetWindowThreadProcessId, IsIconic, IsWindow,
        IsWindowVisible,
    },
};

use super::model::PointLocation;

pub type RawWindowHandle = isize;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct PhysicalWindowRect {
    pub left: i32,
    pub top: i32,
    pub width: i32,
    pub height: i32,
}

impl PhysicalWindowRect {
    pub fn map_normalized(self, x: f64, y: f64) -> Result<(i32, i32), String> {
        if !x.is_finite()
            || !y.is_finite()
            || !(0.0..=1.0).contains(&x)
            || !(0.0..=1.0).contains(&y)
        {
            return Err("窗口相对点位必须是 0 到 1 之间的有限数值".into());
        }
        if self.width <= 0 || self.height <= 0 {
            return Err("目标窗口物理边界无效".into());
        }

        // A normalized value of 1 maps to the final pixel inside the window, not one pixel beyond
        // the exclusive right/bottom edge returned by GetWindowRect.
        let x_offset = (f64::from(self.width.saturating_sub(1)) * x).round() as i32;
        let y_offset = (f64::from(self.height.saturating_sub(1)) * y).round() as i32;
        Ok((
            self.left.saturating_add(x_offset),
            self.top.saturating_add(y_offset),
        ))
    }

    pub fn right(self) -> i32 {
        self.left.saturating_add(self.width)
    }

    pub fn bottom(self) -> i32 {
        self.top.saturating_add(self.height)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct TargetWindowStatus {
    pub exists: bool,
    pub foreground: bool,
    pub minimized: bool,
    pub visible: bool,
    pub physical_rect: Option<PhysicalWindowRect>,
}

impl TargetWindowStatus {
    pub const fn capturable(self) -> bool {
        self.exists && self.visible && !self.minimized && self.physical_rect.is_some()
    }
}

pub fn raw_handle(window: &Window) -> RawWindowHandle {
    window.as_raw_hwnd() as RawWindowHandle
}

pub fn resolve_window(raw: RawWindowHandle) -> Result<Window, String> {
    if !exists(raw) {
        return Err("视觉流程目标窗口已经关闭".into());
    }
    Ok(Window::from_raw_hwnd(as_hwnd(raw).cast()))
}

pub fn foreground_window() -> Result<(Window, RawWindowHandle), String> {
    let hwnd = unsafe { GetForegroundWindow() };
    if hwnd.is_null() {
        return Err("当前没有前台窗口".into());
    }
    let raw = hwnd as RawWindowHandle;
    if !exists(raw) {
        return Err("当前前台窗口已经失效".into());
    }
    let mut process_id = 0;
    if unsafe { GetWindowThreadProcessId(hwnd, &mut process_id) } == 0 || process_id == 0 {
        return Err("无法确认当前前台窗口所属进程".into());
    }
    if belongs_to_current_process(raw) {
        return Err("请先将目标窗口切到前台".into());
    }
    let window = Window::from_raw_hwnd(hwnd.cast());
    physical_rect(raw)?;
    Ok((window, raw))
}

pub fn belongs_to_current_process(raw: RawWindowHandle) -> bool {
    if !exists(raw) {
        return false;
    }
    let mut process_id = 0;
    let found = unsafe { GetWindowThreadProcessId(as_hwnd(raw), &mut process_id) };
    found != 0 && process_id != 0 && process_id == unsafe { GetCurrentProcessId() }
}

pub fn exists(raw: RawWindowHandle) -> bool {
    raw != 0 && unsafe { IsWindow(as_hwnd(raw)) != 0 }
}

pub fn foreground(raw: RawWindowHandle) -> bool {
    exists(raw) && unsafe { GetForegroundWindow() == as_hwnd(raw) }
}

pub fn minimized(raw: RawWindowHandle) -> bool {
    exists(raw) && unsafe { IsIconic(as_hwnd(raw)) != 0 }
}

pub fn visible(raw: RawWindowHandle) -> bool {
    exists(raw) && unsafe { IsWindowVisible(as_hwnd(raw)) != 0 }
}

pub fn capturable(raw: RawWindowHandle) -> bool {
    status(raw).capturable()
}

pub fn status(raw: RawWindowHandle) -> TargetWindowStatus {
    if !exists(raw) {
        return TargetWindowStatus {
            exists: false,
            foreground: false,
            minimized: false,
            visible: false,
            physical_rect: None,
        };
    }
    TargetWindowStatus {
        exists: true,
        foreground: foreground(raw),
        minimized: minimized(raw),
        visible: visible(raw),
        physical_rect: physical_rect(raw).ok(),
    }
}

pub fn physical_rect(raw: RawWindowHandle) -> Result<PhysicalWindowRect, String> {
    if !exists(raw) {
        return Err("视觉流程目标窗口已经关闭".into());
    }
    let mut rect = RECT::default();
    if unsafe { GetWindowRect(as_hwnd(raw), &mut rect) } == 0 {
        return Err(format!(
            "读取视觉流程目标窗口物理边界失败：{}",
            std::io::Error::last_os_error()
        ));
    }
    let width = rect.right.saturating_sub(rect.left);
    let height = rect.bottom.saturating_sub(rect.top);
    if width <= 0 || height <= 0 {
        return Err("视觉流程目标窗口物理边界无效".into());
    }
    Ok(PhysicalWindowRect {
        left: rect.left,
        top: rect.top,
        width,
        height,
    })
}

pub fn map_normalized_point(raw: RawWindowHandle, x: f64, y: f64) -> Result<(i32, i32), String> {
    physical_rect(raw)?.map_normalized(x, y)
}

pub fn contains_physical_point(raw: RawWindowHandle, x: i32, y: i32) -> Result<bool, String> {
    let rect = physical_rect(raw)?;
    Ok(x >= rect.left && x < rect.right() && y >= rect.top && y < rect.bottom())
}

pub fn map_point(raw: RawWindowHandle, location: PointLocation) -> Result<(i32, i32), String> {
    match location {
        PointLocation::WindowRelative { x, y } => map_normalized_point(raw, x, y),
        PointLocation::ScreenPhysical { x, y } => Ok((x, y)),
    }
}

fn as_hwnd(raw: RawWindowHandle) -> HWND {
    raw as HWND
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalized_points_support_negative_monitor_coordinates() {
        let rect = PhysicalWindowRect {
            left: -1_920,
            top: -200,
            width: 1_280,
            height: 720,
        };
        assert_eq!(rect.map_normalized(0.5, 0.25).unwrap(), (-1_280, -20));
        assert_eq!(rect.map_normalized(0.0, 0.0).unwrap(), (-1_920, -200));
        assert_eq!(rect.map_normalized(1.0, 1.0).unwrap(), (-641, 519));
    }

    #[test]
    fn normalized_points_reject_invalid_values() {
        let rect = PhysicalWindowRect {
            left: 0,
            top: 0,
            width: 100,
            height: 100,
        };
        assert!(rect.map_normalized(f64::NAN, 0.5).is_err());
        assert!(rect.map_normalized(-0.1, 0.5).is_err());
        assert!(rect.map_normalized(0.5, 1.1).is_err());
    }

    #[test]
    fn screen_physical_points_do_not_require_a_window() {
        assert_eq!(
            map_point(0, PointLocation::ScreenPhysical { x: -20, y: 30 }).unwrap(),
            (-20, 30)
        );
    }
}
