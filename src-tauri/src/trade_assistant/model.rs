use serde::{Deserialize, Serialize};

use crate::buff_assistant::{BuffTarget, NormalizedRect};

pub const CONFIG_SCHEMA_VERSION: u32 = 2;
pub const MATCH_THRESHOLD: f32 = 0.95;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicalPoint {
    pub x: i32,
    pub y: i32,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TradeCoordinateSlot {
    Record,
    Purchase,
    Search,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeCoordinates {
    pub record: Option<PhysicalPoint>,
    pub purchase: Option<PhysicalPoint>,
    pub search: Option<PhysicalPoint>,
}

impl TradeCoordinates {
    pub fn get(&self, slot: TradeCoordinateSlot) -> Option<PhysicalPoint> {
        match slot {
            TradeCoordinateSlot::Record => self.record,
            TradeCoordinateSlot::Purchase => self.purchase,
            TradeCoordinateSlot::Search => self.search,
        }
    }

    pub fn set(&mut self, slot: TradeCoordinateSlot, point: PhysicalPoint) {
        match slot {
            TradeCoordinateSlot::Record => self.record = Some(point),
            TradeCoordinateSlot::Purchase => self.purchase = Some(point),
            TradeCoordinateSlot::Search => self.search = Some(point),
        }
    }

    pub fn complete(&self) -> bool {
        self.record.is_some() && self.purchase.is_some() && self.search.is_some()
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeTemplateSummary {
    pub id: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeTemplateConfig {
    pub search_region: NormalizedRect,
    pub template: TradeTemplateSummary,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TradeTemplateKind {
    Purchase,
    Guard,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeAssistantHotkeys {
    pub capture: String,
    pub start: String,
    pub stop: String,
}

impl Default for TradeAssistantHotkeys {
    fn default() -> Self {
        Self {
            capture: "CommandOrControl+Alt+Q".into(),
            start: "CommandOrControl+Alt+P".into(),
            stop: "CommandOrControl+Alt+O".into(),
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeAssistantSettings {
    pub purchase_count: u32,
    pub click_interval_ms: u64,
    pub purchase_confirm_frames: u32,
    pub purchase_to_search_delay_ms: u64,
    pub search_to_click_delay_ms: u64,
    pub start_delay_seconds: u32,
    pub hotkeys: TradeAssistantHotkeys,
}

impl Default for TradeAssistantSettings {
    fn default() -> Self {
        Self {
            purchase_count: 1,
            click_interval_ms: 50,
            purchase_confirm_frames: 2,
            purchase_to_search_delay_ms: 100,
            search_to_click_delay_ms: 100,
            start_delay_seconds: 3,
            hotkeys: TradeAssistantHotkeys::default(),
        }
    }
}

impl TradeAssistantSettings {
    pub fn sanitize(&mut self) {
        self.purchase_count = self.purchase_count.clamp(1, 999);
        self.click_interval_ms = self.click_interval_ms.clamp(20, 1_000);
        self.purchase_confirm_frames = self.purchase_confirm_frames.clamp(1, 5);
        self.purchase_to_search_delay_ms = self.purchase_to_search_delay_ms.min(2_000);
        self.search_to_click_delay_ms = self.search_to_click_delay_ms.min(2_000);
        self.start_delay_seconds = self.start_delay_seconds.min(10);
        self.hotkeys.capture = normalize_hotkey(&self.hotkeys.capture);
        self.hotkeys.start = normalize_hotkey(&self.hotkeys.start);
        self.hotkeys.stop = normalize_hotkey(&self.hotkeys.stop);
    }
}

fn normalize_hotkey(value: &str) -> String {
    value
        .trim()
        .split('+')
        .map(|part| match part.trim().to_ascii_lowercase().as_str() {
            "ctrl" | "control" | "commandorcontrol" => "CommandOrControl".into(),
            "escape" | "esc" => "Esc".into(),
            "alt" => "Alt".into(),
            "shift" => "Shift".into(),
            _ => part.trim().to_string(),
        })
        .collect::<Vec<_>>()
        .join("+")
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeAssistantConfig {
    pub schema_version: u32,
    pub target: Option<BuffTarget>,
    pub purchase_template: Option<TradeTemplateConfig>,
    pub guard_template: Option<TradeTemplateConfig>,
    pub coordinates: TradeCoordinates,
    pub settings: TradeAssistantSettings,
}

impl Default for TradeAssistantConfig {
    fn default() -> Self {
        Self {
            schema_version: CONFIG_SCHEMA_VERSION,
            target: None,
            purchase_template: None,
            guard_template: None,
            coordinates: TradeCoordinates::default(),
            settings: TradeAssistantSettings::default(),
        }
    }
}

impl TradeAssistantConfig {
    pub fn sanitize(&mut self) {
        self.schema_version = CONFIG_SCHEMA_VERSION;
        self.settings.sanitize();
        if let Some(template) = &mut self.purchase_template {
            template.search_region = template.search_region.sanitized();
        }
        if let Some(template) = &mut self.guard_template {
            template.search_region = template.search_region.sanitized();
        }
    }

    pub fn complete(&self) -> bool {
        self.target.is_some()
            && self.purchase_template.is_some()
            && self.guard_template.is_some()
            && self.coordinates.complete()
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TradeAssistantActivity {
    Stopped,
    Countdown,
    Validating,
    ClickingRecord,
    Buying,
    ReopeningSearch,
    Testing,
    Completed,
    Error,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeAssistantState {
    pub config: TradeAssistantConfig,
    pub activity: TradeAssistantActivity,
    pub is_running: bool,
    pub countdown_remaining: u32,
    pub completed_purchases: u32,
    pub capture_slot: Option<TradeCoordinateSlot>,
    pub purchase_confidence: f32,
    pub purchase_present: bool,
    pub guard_confidence: f32,
    pub guard_present: bool,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeMetric {
    pub purchase_confidence: f32,
    pub purchase_present: bool,
    pub guard_confidence: f32,
    pub guard_present: bool,
}
