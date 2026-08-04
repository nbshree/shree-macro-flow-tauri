use serde::{Deserialize, Serialize};

pub const WORKFLOW_SCHEMA_VERSION: u32 = 1;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowDefinition {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default)]
    pub target: Option<WorkflowTarget>,
    #[serde(default)]
    pub resources: WorkflowResources,
    #[serde(default)]
    pub safety_guards: Vec<SafetyGuard>,
    pub root: WorkflowStep,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowTarget {
    pub process_name: String,
    pub window_title: String,
    pub class_name: String,
    pub reference_width: u32,
    pub reference_height: u32,
}

#[derive(Clone, Debug, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowResources {
    #[serde(default)]
    pub points: Vec<PointResource>,
    #[serde(default)]
    pub detectors: Vec<DetectorResource>,
    #[serde(default)]
    pub parameters: Vec<NumberParameter>,
    #[serde(default)]
    pub counters: Vec<CounterResource>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PointResource {
    pub id: String,
    pub name: String,
    pub location: PointLocation,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(
    tag = "mode",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum PointLocation {
    WindowRelative { x: f64, y: f64 },
    ScreenPhysical { x: i32, y: i32 },
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizedRegion {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectorTemplateRef {
    pub asset_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mask_asset_id: Option<String>,
    pub width: u32,
    pub height: u32,
    #[serde(default)]
    pub capture_reference_width: u32,
    #[serde(default)]
    pub capture_reference_height: u32,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectorResource {
    pub id: String,
    pub name: String,
    pub search_region: NormalizedRegion,
    pub template: DetectorTemplateRef,
    pub match_threshold: f32,
    pub confirm_frames: u32,
    pub missing_frames: u32,
    pub stale_after_ms: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NumberParameter {
    pub id: String,
    pub name: String,
    pub default_value: i64,
    pub min_value: i64,
    pub max_value: i64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CounterResource {
    pub id: String,
    pub name: String,
    pub initial_value: i64,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SafetyGuard {
    pub condition: Condition,
    pub message: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowStep {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(flatten)]
    pub node: WorkflowNode,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum WorkflowNode {
    Sequence {
        #[serde(default)]
        steps: Vec<WorkflowStep>,
    },
    Click {
        point_id: String,
        #[serde(default)]
        button: MouseButton,
        #[serde(default = "default_click_count")]
        click_count: u8,
    },
    Key {
        chord: KeyChord,
    },
    Delay {
        duration_ms: NumberExpression,
    },
    If {
        condition: Condition,
        then_branch: Box<WorkflowStep>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        else_branch: Option<Box<WorkflowStep>>,
    },
    Repeat {
        count: NumberExpression,
        max_iterations: u32,
        body: Box<WorkflowStep>,
    },
    RepeatUntil {
        condition: Condition,
        body: Box<WorkflowStep>,
        timeout_ms: NumberExpression,
        poll_interval_ms: NumberExpression,
        max_iterations: u32,
    },
    WaitUntil {
        condition: Condition,
        timeout_ms: NumberExpression,
        poll_interval_ms: NumberExpression,
    },
    CounterAdd {
        counter_id: String,
        amount: NumberExpression,
    },
    Assert {
        condition: Condition,
        message: String,
    },
    Log {
        message: String,
    },
    Finish {
        outcome: FinishOutcome,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        message: Option<String>,
    },
}

const fn default_click_count() -> u8 {
    1
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MouseButton {
    #[default]
    Left,
    Right,
    Middle,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KeyChord {
    pub keys: Vec<String>,
    #[serde(default)]
    pub hold_ms: u64,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum FinishOutcome {
    Success,
    Failure,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum Condition {
    DetectorState {
        detector_id: String,
        state: DetectorState,
    },
    CounterCompare {
        counter_id: String,
        operator: CompareOperator,
        value: NumberExpression,
    },
    All {
        #[serde(default)]
        conditions: Vec<Condition>,
    },
    Any {
        #[serde(default)]
        conditions: Vec<Condition>,
    },
    Not {
        condition: Box<Condition>,
    },
    TargetState {
        state: TargetState,
        #[serde(default = "default_true")]
        expected: bool,
    },
}

const fn default_true() -> bool {
    true
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DetectorState {
    Unknown,
    Present,
    Absent,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, Hash, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TargetState {
    Exists,
    Foreground,
    Capturable,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CompareOperator {
    Equal,
    NotEqual,
    LessThan,
    LessThanOrEqual,
    GreaterThan,
    GreaterThanOrEqual,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum NumberExpression {
    Literal { value: i64 },
    Parameter { parameter_id: String },
    Counter { counter_id: String },
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TruthValue {
    True,
    False,
    Unknown,
}

impl TruthValue {
    pub const fn not(self) -> Self {
        match self {
            Self::True => Self::False,
            Self::False => Self::True,
            Self::Unknown => Self::Unknown,
        }
    }

    pub fn all(values: impl IntoIterator<Item = Self>) -> Self {
        let mut saw_unknown = false;
        for value in values {
            match value {
                Self::False => return Self::False,
                Self::Unknown => saw_unknown = true,
                Self::True => {}
            }
        }
        if saw_unknown {
            Self::Unknown
        } else {
            Self::True
        }
    }

    pub fn any(values: impl IntoIterator<Item = Self>) -> Self {
        let mut saw_unknown = false;
        for value in values {
            match value {
                Self::True => return Self::True,
                Self::Unknown => saw_unknown = true,
                Self::False => {}
            }
        }
        if saw_unknown {
            Self::Unknown
        } else {
            Self::False
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub path: String,
    pub severity: DiagnosticSeverity,
    pub code: String,
    pub message: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DiagnosticSeverity {
    Error,
    Warning,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn three_value_logic_uses_kleene_semantics() {
        assert_eq!(
            TruthValue::all([TruthValue::True, TruthValue::Unknown]),
            TruthValue::Unknown
        );
        assert_eq!(
            TruthValue::all([TruthValue::Unknown, TruthValue::False]),
            TruthValue::False
        );
        assert_eq!(
            TruthValue::any([TruthValue::False, TruthValue::Unknown]),
            TruthValue::Unknown
        );
        assert_eq!(
            TruthValue::any([TruthValue::Unknown, TruthValue::True]),
            TruthValue::True
        );
        assert_eq!(TruthValue::Unknown.not(), TruthValue::Unknown);
    }

    #[test]
    fn node_serialization_uses_camel_case_tags() {
        let node = WorkflowStep {
            id: "wait-foreground".into(),
            label: None,
            enabled: true,
            node: WorkflowNode::RepeatUntil {
                condition: Condition::TargetState {
                    state: TargetState::Foreground,
                    expected: true,
                },
                body: Box::new(WorkflowStep {
                    id: "write-log".into(),
                    label: None,
                    enabled: true,
                    node: WorkflowNode::Log {
                        message: "waiting".into(),
                    },
                }),
                timeout_ms: NumberExpression::Literal { value: 1_000 },
                poll_interval_ms: NumberExpression::Literal { value: 25 },
                max_iterations: 20,
            },
        };
        let json = serde_json::to_value(node).unwrap();
        assert_eq!(json["id"], "wait-foreground");
        assert_eq!(json["type"], "repeatUntil");
        assert_eq!(json["timeoutMs"]["type"], "literal");
        assert_eq!(json["condition"]["type"], "targetState");
    }

    #[test]
    fn legacy_template_refs_default_capture_reference_size_to_zero() {
        let template: DetectorTemplateRef = serde_json::from_value(serde_json::json!({
            "assetId": "legacy-template",
            "width": 16,
            "height": 12
        }))
        .unwrap();
        assert_eq!(template.capture_reference_width, 0);
        assert_eq!(template.capture_reference_height, 0);
    }

    #[test]
    fn workflow_serialization_keeps_a_null_target_field() {
        let definition = WorkflowDefinition {
            schema_version: WORKFLOW_SCHEMA_VERSION,
            id: "empty".into(),
            name: "Empty".into(),
            description: None,
            target: None,
            resources: WorkflowResources::default(),
            safety_guards: Vec::new(),
            root: WorkflowStep {
                id: "root".into(),
                label: None,
                enabled: true,
                node: WorkflowNode::Sequence { steps: Vec::new() },
            },
        };

        let json = serde_json::to_value(definition).unwrap();
        assert_eq!(json["target"], serde_json::Value::Null);
    }
}
