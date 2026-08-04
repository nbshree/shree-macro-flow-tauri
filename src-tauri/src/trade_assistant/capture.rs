use std::{
    thread,
    time::{Duration, Instant},
};

use crossbeam_channel::{Receiver, Sender, TrySendError, bounded};
use image::RgbaImage;
use tauri::AppHandle;
use windows_capture::{
    capture::{CaptureControl, Context, GraphicsCaptureApiHandler},
    frame::Frame,
    graphics_capture_api::InternalCaptureControl,
    settings::{
        ColorFormat, CursorCaptureSettings, DirtyRegionSettings, DrawBorderSettings,
        MinimumUpdateIntervalSettings, SecondaryWindowSettings, Settings,
    },
    window::Window,
};

use crate::buff_assistant::{
    NormalizedRect,
    detector::{StablePresenceDetector, TemplateData, match_template, rgba_to_gray},
};

pub type TradeCaptureControl = CaptureControl<TradeCaptureHandler, String>;

#[derive(Clone)]
pub struct TradeCaptureFlags {
    pub app: AppHandle,
    pub run_id: u64,
    pub purchase_region: NormalizedRect,
    pub purchase_template: TemplateData,
    pub purchase_confirm_frames: u32,
    pub guard_region: NormalizedRect,
    pub guard_template: TemplateData,
    pub reference_width: u32,
    pub reference_height: u32,
}

struct TradeFrame {
    width: u32,
    height: u32,
    rgba: Vec<u8>,
}

pub struct TradeCaptureHandler {
    sender: Sender<TradeFrame>,
    discard_receiver: Receiver<TradeFrame>,
    last_enqueued_at: Instant,
    app: AppHandle,
    run_id: u64,
}

struct Processor {
    flags: TradeCaptureFlags,
    purchase_detector: StablePresenceDetector,
    guard_detector: StablePresenceDetector,
    prepared_purchase: Option<(u32, u32, TemplateData)>,
    prepared_guard: Option<(u32, u32, TemplateData)>,
}

impl GraphicsCaptureApiHandler for TradeCaptureHandler {
    type Flags = TradeCaptureFlags;
    type Error = String;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        let (sender, receiver) = bounded(1);
        let discard_receiver = receiver.clone();
        let app = ctx.flags.app.clone();
        let run_id = ctx.flags.run_id;
        let mut processor = Processor {
            purchase_detector: StablePresenceDetector::new(ctx.flags.purchase_confirm_frames, 2),
            guard_detector: StablePresenceDetector::new(3, 3),
            prepared_purchase: None,
            prepared_guard: None,
            flags: ctx.flags,
        };
        thread::spawn(move || {
            while let Ok(frame) = receiver.recv() {
                if let Err(error) = processor.process(frame) {
                    super::handle_capture_error(
                        &processor.flags.app,
                        processor.flags.run_id,
                        error,
                    );
                    return;
                }
            }
        });
        Ok(Self {
            sender,
            discard_receiver,
            last_enqueued_at: Instant::now() - Duration::from_millis(83),
            app,
            run_id,
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        _control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        if self.last_enqueued_at.elapsed() < Duration::from_millis(83) {
            return Ok(());
        }
        self.last_enqueued_at = Instant::now();
        let mut padding = Vec::new();
        let buffer = frame
            .buffer()
            .map_err(|error| format!("读取交易行画面失败：{error}"))?;
        let item = TradeFrame {
            width: buffer.width(),
            height: buffer.height(),
            rgba: buffer.as_nopadding_buffer(&mut padding).to_vec(),
        };
        match self.sender.try_send(item) {
            Ok(()) => Ok(()),
            Err(TrySendError::Full(latest)) => {
                let _ = self.discard_receiver.try_recv();
                let _ = self.sender.try_send(latest);
                Ok(())
            }
            Err(TrySendError::Disconnected(_)) => Err("交易行识别线程已经停止".into()),
        }
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        super::handle_capture_error(&self.app, self.run_id, "游戏窗口已经关闭".into());
        Ok(())
    }
}

impl Processor {
    fn process(&mut self, frame: TradeFrame) -> Result<(), String> {
        let image = RgbaImage::from_raw(frame.width, frame.height, frame.rgba)
            .ok_or_else(|| "交易行截图数据不完整".to_string())?;
        let purchase = crop_gray(&image, self.flags.purchase_region)?;
        let guard = crop_gray(&image, self.flags.guard_region)?;
        self.prepare_templates(frame.width, frame.height);
        let purchase_confidence =
            match_template(&purchase, &self.prepared_purchase.as_ref().unwrap().2);
        let guard_confidence = match_template(&guard, &self.prepared_guard.as_ref().unwrap().2);
        let purchase_present = self
            .purchase_detector
            .update(purchase_confidence >= super::model::MATCH_THRESHOLD);
        let guard_present = self
            .guard_detector
            .update(guard_confidence >= super::model::MATCH_THRESHOLD);
        let guard_absent = self.guard_detector.absence_confirmed();
        super::handle_detection_frame(
            &self.flags.app,
            self.flags.run_id,
            purchase_confidence,
            purchase_present,
            guard_confidence,
            guard_present,
            guard_absent,
        );
        Ok(())
    }

    fn prepare_templates(&mut self, width: u32, height: u32) {
        let rebuild =
            self.prepared_purchase
                .as_ref()
                .is_none_or(|(current_width, current_height, _)| {
                    *current_width != width || *current_height != height
                });
        if !rebuild {
            return;
        }
        let scale_x = width as f32 / self.flags.reference_width.max(1) as f32;
        let scale_y = height as f32 / self.flags.reference_height.max(1) as f32;
        self.prepared_purchase = Some((
            width,
            height,
            self.flags.purchase_template.scaled_xy(scale_x, scale_y),
        ));
        self.prepared_guard = Some((
            width,
            height,
            self.flags.guard_template.scaled_xy(scale_x, scale_y),
        ));
    }
}

fn crop_gray(image: &RgbaImage, region: NormalizedRect) -> Result<image::GrayImage, String> {
    let (x1, y1, x2, y2) = region.pixel_bounds(image.width(), image.height());
    let crop = image::imageops::crop_imm(image, x1, y1, x2 - x1, y2 - y1).to_image();
    rgba_to_gray(crop.width(), crop.height(), crop.as_raw())
}

pub fn start(window: Window, flags: TradeCaptureFlags) -> Result<TradeCaptureControl, String> {
    let settings = Settings::new(
        window,
        CursorCaptureSettings::WithoutCursor,
        DrawBorderSettings::Default,
        SecondaryWindowSettings::Default,
        MinimumUpdateIntervalSettings::Default,
        DirtyRegionSettings::Default,
        ColorFormat::Rgba8,
        flags,
    );
    TradeCaptureHandler::start_free_threaded(settings)
        .map_err(|error| format!("启动交易行截图失败：{error}"))
}
