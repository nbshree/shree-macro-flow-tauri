use std::{
    collections::{BTreeMap, HashSet},
    panic::{AssertUnwindSafe, catch_unwind},
    sync::{
        Arc, RwLock,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::{Duration, Instant},
};

use crossbeam_channel::{Receiver, Sender, TrySendError, bounded};
use image::{GrayImage, imageops};
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

use crate::buff_assistant::detector::{
    StablePresenceDetector, TemplateData, match_template, rgba_to_gray,
};

use super::model::{DetectorResource, DetectorState, NormalizedRegion};

const FRAME_INTERVAL: Duration = Duration::from_millis(83);

pub type VisualCaptureControl = CaptureControl<VisualCaptureHandler, String>;
pub type CaptureTerminationCallback = Arc<dyn Fn(CaptureTermination) + Send + Sync + 'static>;

#[derive(Clone)]
pub struct DetectorBinding {
    pub resource: DetectorResource,
    pub template: TemplateData,
}

#[derive(Clone, Debug)]
pub struct DetectorObservation {
    pub detector_id: String,
    pub state: DetectorState,
    pub confidence: f32,
    pub updated_at: Instant,
    pub frame_sequence: u64,
}

impl DetectorObservation {
    pub fn state_at(&self, now: Instant, stale_after: Duration) -> DetectorState {
        if self.frame_sequence == 0 || now.saturating_duration_since(self.updated_at) > stale_after
        {
            DetectorState::Unknown
        } else {
            self.state
        }
    }
}

#[derive(Clone, Debug)]
pub struct DetectorSnapshot {
    pub frame_sequence: u64,
    pub frame_width: u32,
    pub frame_height: u32,
    pub updated_at: Instant,
    pub detectors: BTreeMap<String, DetectorObservation>,
}

#[derive(Clone)]
pub struct DetectorSnapshotStore {
    inner: Arc<RwLock<DetectorSnapshot>>,
    stale_after: Arc<BTreeMap<String, Duration>>,
}

impl DetectorSnapshotStore {
    pub fn new(detectors: &[DetectorResource]) -> Self {
        let now = Instant::now();
        let observations = detectors
            .iter()
            .map(|detector| {
                (
                    detector.id.clone(),
                    DetectorObservation {
                        detector_id: detector.id.clone(),
                        state: DetectorState::Unknown,
                        confidence: 0.0,
                        updated_at: now,
                        frame_sequence: 0,
                    },
                )
            })
            .collect();
        let stale_after = detectors
            .iter()
            .map(|detector| {
                (
                    detector.id.clone(),
                    Duration::from_millis(detector.stale_after_ms),
                )
            })
            .collect();
        Self {
            inner: Arc::new(RwLock::new(DetectorSnapshot {
                frame_sequence: 0,
                frame_width: 0,
                frame_height: 0,
                updated_at: now,
                detectors: observations,
            })),
            stale_after: Arc::new(stale_after),
        }
    }

    /// Returns one coherent snapshot. Observations that have expired are downgraded to Unknown.
    pub fn snapshot(&self) -> DetectorSnapshot {
        self.snapshot_at(Instant::now())
    }

    pub fn snapshot_at(&self, now: Instant) -> DetectorSnapshot {
        let mut snapshot = self.raw_snapshot();
        for (detector_id, observation) in &mut snapshot.detectors {
            let stale_after = self
                .stale_after
                .get(detector_id)
                .copied()
                .unwrap_or(Duration::ZERO);
            observation.state = observation.state_at(now, stale_after);
        }
        snapshot
    }

    pub fn observation(&self, detector_id: &str) -> Option<DetectorObservation> {
        self.observation_at(detector_id, Instant::now())
    }

    pub fn observation_at(&self, detector_id: &str, now: Instant) -> Option<DetectorObservation> {
        let mut observation = self.raw_snapshot().detectors.get(detector_id)?.clone();
        let stale_after = self
            .stale_after
            .get(detector_id)
            .copied()
            .unwrap_or(Duration::ZERO);
        observation.state = observation.state_at(now, stale_after);
        Some(observation)
    }

    pub fn detector_state(&self, detector_id: &str) -> DetectorState {
        self.observation(detector_id)
            .map_or(DetectorState::Unknown, |value| value.state)
    }

    pub fn detector_state_at(&self, detector_id: &str, now: Instant) -> DetectorState {
        self.observation_at(detector_id, now)
            .map_or(DetectorState::Unknown, |value| value.state)
    }

    fn raw_snapshot(&self) -> DetectorSnapshot {
        self.inner
            .read()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    fn publish(&self, snapshot: DetectorSnapshot) {
        *self
            .inner
            .write()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = snapshot;
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CaptureTerminationKind {
    WindowClosed,
    ProcessingFailed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CaptureTermination {
    pub kind: CaptureTerminationKind,
    pub message: String,
}

#[derive(Clone)]
pub struct CaptureFlags {
    pub detectors: Vec<DetectorBinding>,
    pub snapshots: DetectorSnapshotStore,
    pub termination_callback: Option<CaptureTerminationCallback>,
}

impl CaptureFlags {
    pub fn new(detectors: Vec<DetectorBinding>, snapshots: DetectorSnapshotStore) -> Self {
        Self {
            detectors,
            snapshots,
            termination_callback: None,
        }
    }

    pub fn from_bindings(detectors: Vec<DetectorBinding>) -> (Self, DetectorSnapshotStore) {
        let resources = detectors
            .iter()
            .map(|binding| binding.resource.clone())
            .collect::<Vec<_>>();
        let snapshots = DetectorSnapshotStore::new(&resources);
        (Self::new(detectors, snapshots.clone()), snapshots)
    }

    pub fn with_termination_callback(mut self, callback: CaptureTerminationCallback) -> Self {
        self.termination_callback = Some(callback);
        self
    }

    fn validate(&self) -> Result<(), String> {
        let mut ids = HashSet::new();
        for binding in &self.detectors {
            if binding.resource.id.trim().is_empty() {
                return Err("视觉流程识别器 ID 不能为空".into());
            }
            if !ids.insert(binding.resource.id.as_str()) {
                return Err(format!("视觉流程识别器 ID '{}' 重复", binding.resource.id));
            }
            normalized_region_pixel_bounds(binding.resource.search_region, 1_000, 1_000)?;
            if binding.resource.template.capture_reference_width == 0
                || binding.resource.template.capture_reference_height == 0
            {
                return Err(format!(
                    "视觉流程识别器 '{}' 缺少模板采集参考尺寸",
                    binding.resource.id
                ));
            }
        }
        Ok(())
    }
}

struct CapturedFrame {
    width: u32,
    height: u32,
    rgba: Vec<u8>,
}

#[derive(Clone)]
struct TerminationNotifier {
    callback: Option<CaptureTerminationCallback>,
    fired: Arc<AtomicBool>,
}

impl TerminationNotifier {
    fn new(callback: Option<CaptureTerminationCallback>) -> Self {
        Self {
            callback,
            fired: Arc::new(AtomicBool::new(false)),
        }
    }

    fn notify(&self, kind: CaptureTerminationKind, message: impl Into<String>) {
        if self.fired.swap(true, Ordering::AcqRel) {
            return;
        }
        if let Some(callback) = &self.callback {
            let event = CaptureTermination {
                kind,
                message: message.into(),
            };
            let _ = catch_unwind(AssertUnwindSafe(|| callback(event)));
        }
    }
}

pub struct VisualCaptureHandler {
    sender: Sender<CapturedFrame>,
    discard_receiver: Receiver<CapturedFrame>,
    last_enqueued_at: Instant,
    termination: TerminationNotifier,
}

struct Processor {
    detectors: Vec<PreparedDetector>,
    snapshots: DetectorSnapshotStore,
    frame_sequence: u64,
    termination: TerminationNotifier,
}

struct PreparedDetector {
    resource: DetectorResource,
    source_template: TemplateData,
    tracker: StablePresenceDetector,
    scaled_template: Option<(u32, u32, TemplateData)>,
}

impl GraphicsCaptureApiHandler for VisualCaptureHandler {
    type Flags = CaptureFlags;
    type Error = String;

    fn new(ctx: Context<Self::Flags>) -> Result<Self, Self::Error> {
        ctx.flags.validate()?;
        let (sender, receiver) = bounded(1);
        let discard_receiver = receiver.clone();
        let termination = TerminationNotifier::new(ctx.flags.termination_callback.clone());
        let mut processor = Processor::new(ctx.flags, termination.clone());
        thread::spawn(move || {
            while let Ok(frame) = receiver.recv() {
                if let Err(error) = processor.process(frame) {
                    processor
                        .termination
                        .notify(CaptureTerminationKind::ProcessingFailed, error);
                    return;
                }
            }
        });
        Ok(Self {
            sender,
            discard_receiver,
            last_enqueued_at: Instant::now() - FRAME_INTERVAL,
            termination,
        })
    }

    fn on_frame_arrived(
        &mut self,
        frame: &mut Frame,
        _control: InternalCaptureControl,
    ) -> Result<(), Self::Error> {
        if self.last_enqueued_at.elapsed() < FRAME_INTERVAL {
            return Ok(());
        }
        self.last_enqueued_at = Instant::now();
        let mut padding = Vec::new();
        let buffer = frame.buffer().map_err(|error| {
            let message = format!("读取视觉流程目标窗口画面失败：{error}");
            self.termination
                .notify(CaptureTerminationKind::ProcessingFailed, message.clone());
            message
        })?;
        let item = CapturedFrame {
            width: buffer.width(),
            height: buffer.height(),
            rgba: buffer.as_nopadding_buffer(&mut padding).to_vec(),
        };
        enqueue_latest(
            &self.sender,
            &self.discard_receiver,
            item,
            &self.termination,
        )
    }

    fn on_closed(&mut self) -> Result<(), Self::Error> {
        self.termination.notify(
            CaptureTerminationKind::WindowClosed,
            "视觉流程目标窗口已经关闭",
        );
        Ok(())
    }
}

impl Processor {
    fn new(flags: CaptureFlags, termination: TerminationNotifier) -> Self {
        let frame_sequence = flags.snapshots.raw_snapshot().frame_sequence;
        let detectors = flags
            .detectors
            .into_iter()
            .map(|binding| PreparedDetector {
                tracker: StablePresenceDetector::new(
                    binding.resource.confirm_frames,
                    binding.resource.missing_frames,
                ),
                resource: binding.resource,
                source_template: binding.template,
                scaled_template: None,
            })
            .collect();
        Self {
            detectors,
            snapshots: flags.snapshots,
            frame_sequence,
            termination,
        }
    }

    fn process(&mut self, frame: CapturedFrame) -> Result<(), String> {
        let image = rgba_to_gray(frame.width, frame.height, &frame.rgba)?;
        let updated_at = Instant::now();
        self.frame_sequence = self.frame_sequence.saturating_add(1);
        let mut observations = BTreeMap::new();

        for detector in &mut self.detectors {
            let search = crop_gray(&image, detector.resource.search_region)?;
            let template = detector.scaled_template(frame.width, frame.height);
            let confidence = match_template(&search, template);
            let matched = confidence >= detector.resource.match_threshold;
            let present = detector.tracker.update(matched);
            let state = if present {
                DetectorState::Present
            } else if detector.tracker.absence_confirmed() {
                DetectorState::Absent
            } else {
                DetectorState::Unknown
            };
            observations.insert(
                detector.resource.id.clone(),
                DetectorObservation {
                    detector_id: detector.resource.id.clone(),
                    state,
                    confidence,
                    updated_at,
                    frame_sequence: self.frame_sequence,
                },
            );
        }

        self.snapshots.publish(DetectorSnapshot {
            frame_sequence: self.frame_sequence,
            frame_width: frame.width,
            frame_height: frame.height,
            updated_at,
            detectors: observations,
        });
        Ok(())
    }
}

impl PreparedDetector {
    fn scaled_template(&mut self, frame_width: u32, frame_height: u32) -> &TemplateData {
        let rebuild = self
            .scaled_template
            .as_ref()
            .is_none_or(|(width, height, _)| *width != frame_width || *height != frame_height);
        if rebuild {
            let scale_x =
                frame_width as f32 / self.resource.template.capture_reference_width.max(1) as f32;
            let scale_y =
                frame_height as f32 / self.resource.template.capture_reference_height.max(1) as f32;
            self.scaled_template = Some((
                frame_width,
                frame_height,
                self.source_template.scaled_xy(scale_x, scale_y),
            ));
        }
        &self.scaled_template.as_ref().unwrap().2
    }
}

fn enqueue_latest(
    sender: &Sender<CapturedFrame>,
    discard_receiver: &Receiver<CapturedFrame>,
    frame: CapturedFrame,
    termination: &TerminationNotifier,
) -> Result<(), String> {
    match sender.try_send(frame) {
        Ok(()) => Ok(()),
        Err(TrySendError::Full(latest)) => {
            let _ = discard_receiver.try_recv();
            match sender.try_send(latest) {
                Ok(()) | Err(TrySendError::Full(_)) => Ok(()),
                Err(TrySendError::Disconnected(_)) => {
                    let message = "视觉流程识别线程已经停止".to_string();
                    termination.notify(CaptureTerminationKind::ProcessingFailed, message.clone());
                    Err(message)
                }
            }
        }
        Err(TrySendError::Disconnected(_)) => {
            let message = "视觉流程识别线程已经停止".to_string();
            termination.notify(CaptureTerminationKind::ProcessingFailed, message.clone());
            Err(message)
        }
    }
}

fn crop_gray(image: &GrayImage, region: NormalizedRegion) -> Result<GrayImage, String> {
    let (x1, y1, x2, y2) = normalized_region_pixel_bounds(region, image.width(), image.height())?;
    Ok(imageops::crop_imm(image, x1, y1, x2 - x1, y2 - y1).to_image())
}

pub fn normalized_region_pixel_bounds(
    region: NormalizedRegion,
    frame_width: u32,
    frame_height: u32,
) -> Result<(u32, u32, u32, u32), String> {
    if frame_width == 0 || frame_height == 0 {
        return Err("视觉流程截图尺寸无效".into());
    }
    let values = [region.x, region.y, region.width, region.height];
    if values.iter().any(|value| !value.is_finite())
        || region.x < 0.0
        || region.y < 0.0
        || region.width <= 0.0
        || region.height <= 0.0
        || region.x + region.width > 1.0 + f64::EPSILON
        || region.y + region.height > 1.0 + f64::EPSILON
    {
        return Err("视觉流程识别区域必须位于目标窗口内".into());
    }
    let start_x = (region.x * f64::from(frame_width)).floor() as u32;
    let start_y = (region.y * f64::from(frame_height)).floor() as u32;
    let end_x = ((region.x + region.width) * f64::from(frame_width)).ceil() as u32;
    let end_y = ((region.y + region.height) * f64::from(frame_height)).ceil() as u32;
    Ok((
        start_x.min(frame_width - 1),
        start_y.min(frame_height - 1),
        end_x.clamp(start_x.saturating_add(1), frame_width),
        end_y.clamp(start_y.saturating_add(1), frame_height),
    ))
}

pub fn start(window: Window, flags: CaptureFlags) -> Result<VisualCaptureControl, String> {
    flags.validate()?;
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
    VisualCaptureHandler::start_free_threaded(settings)
        .map_err(|error| format!("启动视觉流程窗口截图失败：{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::visual_workflow::model::DetectorTemplateRef;
    use image::Luma;

    fn resource(stale_after_ms: u64) -> DetectorResource {
        DetectorResource {
            id: "buy".into(),
            name: "购买按钮".into(),
            search_region: NormalizedRegion {
                x: 0.1,
                y: 0.2,
                width: 0.3,
                height: 0.4,
            },
            template: DetectorTemplateRef {
                asset_id: "buy-template".into(),
                mask_asset_id: None,
                width: 10,
                height: 10,
                capture_reference_width: 800,
                capture_reference_height: 600,
            },
            match_threshold: 0.95,
            confirm_frames: 2,
            missing_frames: 2,
            stale_after_ms,
        }
    }

    #[test]
    fn normalized_region_rounds_outward_and_stays_in_frame() {
        assert_eq!(
            normalized_region_pixel_bounds(
                NormalizedRegion {
                    x: 0.101,
                    y: 0.201,
                    width: 0.3,
                    height: 0.4,
                },
                100,
                50,
            )
            .unwrap(),
            (10, 10, 41, 31)
        );
        assert!(
            normalized_region_pixel_bounds(
                NormalizedRegion {
                    x: 0.9,
                    y: 0.0,
                    width: 0.2,
                    height: 1.0,
                },
                100,
                100,
            )
            .is_err()
        );
    }

    #[test]
    fn stale_observations_are_reported_as_unknown() {
        let detector = resource(100);
        let store = DetectorSnapshotStore::new(std::slice::from_ref(&detector));
        let updated_at = Instant::now();
        store.publish(DetectorSnapshot {
            frame_sequence: 1,
            frame_width: 800,
            frame_height: 600,
            updated_at,
            detectors: BTreeMap::from([(
                detector.id.clone(),
                DetectorObservation {
                    detector_id: detector.id.clone(),
                    state: DetectorState::Present,
                    confidence: 0.99,
                    updated_at,
                    frame_sequence: 1,
                },
            )]),
        });
        assert_eq!(
            store.detector_state_at("buy", updated_at + Duration::from_millis(100)),
            DetectorState::Present
        );
        assert_eq!(
            store.detector_state_at("buy", updated_at + Duration::from_millis(101)),
            DetectorState::Unknown
        );
    }

    #[test]
    fn snapshot_is_published_as_one_frame() {
        let first = resource(1_000);
        let mut second = first.clone();
        second.id = "guard".into();
        let store = DetectorSnapshotStore::new(&[first.clone(), second.clone()]);
        let now = Instant::now();
        store.publish(DetectorSnapshot {
            frame_sequence: 9,
            frame_width: 1_280,
            frame_height: 720,
            updated_at: now,
            detectors: BTreeMap::from([
                (
                    first.id.clone(),
                    DetectorObservation {
                        detector_id: first.id,
                        state: DetectorState::Present,
                        confidence: 0.98,
                        updated_at: now,
                        frame_sequence: 9,
                    },
                ),
                (
                    second.id.clone(),
                    DetectorObservation {
                        detector_id: second.id,
                        state: DetectorState::Absent,
                        confidence: 0.2,
                        updated_at: now,
                        frame_sequence: 9,
                    },
                ),
            ]),
        });
        let snapshot = store.snapshot_at(now);
        assert_eq!(snapshot.frame_sequence, 9);
        assert!(
            snapshot
                .detectors
                .values()
                .all(|observation| observation.frame_sequence == 9)
        );
    }

    #[test]
    fn templates_scale_from_each_detector_capture_reference() {
        let template = TemplateData::new(
            GrayImage::from_pixel(10, 10, Luma([80])),
            GrayImage::from_pixel(10, 10, Luma([255])),
        )
        .unwrap();
        let mut first = PreparedDetector {
            resource: resource(1_000),
            source_template: template.clone(),
            tracker: StablePresenceDetector::new(1, 1),
            scaled_template: None,
        };
        let mut second = PreparedDetector {
            resource: resource(1_000),
            source_template: template,
            tracker: StablePresenceDetector::new(1, 1),
            scaled_template: None,
        };
        first.resource.template.capture_reference_width = 100;
        first.resource.template.capture_reference_height = 100;
        second.resource.template.capture_reference_width = 200;
        second.resource.template.capture_reference_height = 200;

        assert_eq!(first.scaled_template(200, 200).image.dimensions(), (20, 20));
        assert_eq!(
            second.scaled_template(200, 200).image.dimensions(),
            (10, 10)
        );
    }
}
