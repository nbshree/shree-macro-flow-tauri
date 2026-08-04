use std::collections::{HashMap, HashSet};

use crate::model::{normalize_key, virtual_key_code};

use super::model::{
    Condition, DetectorState, Diagnostic, DiagnosticSeverity, NumberExpression, NumberParameter,
    PointLocation, WORKFLOW_SCHEMA_VERSION, WorkflowDefinition, WorkflowNode, WorkflowStep,
};

pub const MAX_WORKFLOW_DEPTH: usize = 32;
pub const MAX_WORKFLOW_NODES: usize = 10_000;
pub const MAX_LOOP_ITERATIONS: u32 = 1_000_000;
pub const MAX_KEY_CHORD_KEYS: usize = 8;
pub const MAX_KEY_HOLD_MS: u64 = 60_000;
pub const MAX_CLICK_COUNT: u8 = 3;
pub const MAX_DETECTOR_STABLE_FRAMES: u32 = 120;
pub const MIN_DETECTOR_STALE_AFTER_MS: u64 = 166;
pub const MIN_JS_SAFE_INTEGER: i64 = -9_007_199_254_740_991;
pub const MAX_JS_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

pub fn validate_workflow(workflow: &WorkflowDefinition) -> Vec<Diagnostic> {
    Validator::new(workflow).validate()
}

pub fn has_errors(diagnostics: &[Diagnostic]) -> bool {
    diagnostics
        .iter()
        .any(|item| item.severity == DiagnosticSeverity::Error)
}

struct Validator<'a> {
    workflow: &'a WorkflowDefinition,
    diagnostics: Vec<Diagnostic>,
    point_ids: HashSet<String>,
    detector_ids: HashSet<String>,
    parameters: HashMap<String, NumberParameter>,
    counter_ids: HashSet<String>,
    step_ids: HashSet<String>,
    node_count: usize,
}

impl<'a> Validator<'a> {
    fn new(workflow: &'a WorkflowDefinition) -> Self {
        Self {
            workflow,
            diagnostics: Vec::new(),
            point_ids: HashSet::new(),
            detector_ids: HashSet::new(),
            parameters: HashMap::new(),
            counter_ids: HashSet::new(),
            step_ids: HashSet::new(),
            node_count: 0,
        }
    }

    fn validate(mut self) -> Vec<Diagnostic> {
        if self.workflow.schema_version != WORKFLOW_SCHEMA_VERSION {
            self.error(
                "$.schemaVersion",
                "unsupportedSchemaVersion",
                format!(
                    "不支持流程 schemaVersion {}，当前仅支持 {}",
                    self.workflow.schema_version, WORKFLOW_SCHEMA_VERSION
                ),
            );
        }
        let workflow_id = self.workflow.id.clone();
        let workflow_name = self.workflow.name.clone();
        self.validate_required_text("$.id", &workflow_id, "流程 ID");
        self.validate_required_text("$.name", &workflow_name, "流程名称");
        self.validate_target();
        self.validate_resources();

        let guards = self.workflow.safety_guards.clone();
        for (index, guard) in guards.iter().enumerate() {
            let path = format!("$.safetyGuards[{index}]");
            self.validate_condition(&guard.condition, &format!("{path}.condition"), 0);
            self.validate_required_text(&format!("{path}.message"), &guard.message, "保护提示");
        }

        let root = self.workflow.root.clone();
        self.validate_step(&root, "$.root", 0);
        if self.node_count > MAX_WORKFLOW_NODES {
            self.error(
                "$.root",
                "tooManyNodes",
                format!(
                    "流程包含 {} 个节点，最多允许 {MAX_WORKFLOW_NODES} 个",
                    self.node_count
                ),
            );
        }
        self.diagnostics
    }

    fn validate_target(&mut self) {
        let Some(target) = self.workflow.target.clone() else {
            self.error(
                "$.target",
                "missingTarget",
                "请先从窗口预览中绑定视觉流程目标窗口",
            );
            return;
        };
        self.validate_required_text("$.target.processName", &target.process_name, "目标进程名");
        self.validate_required_text("$.target.windowTitle", &target.window_title, "目标窗口标题");
        self.validate_required_text("$.target.className", &target.class_name, "目标窗口类名");
        if target.reference_width == 0 || target.reference_height == 0 {
            self.error(
                "$.target",
                "invalidTargetReferenceSize",
                "目标窗口参考尺寸必须大于 0",
            );
        }
    }

    fn validate_resources(&mut self) {
        let resources = self.workflow.resources.clone();
        for (index, point) in resources.points.iter().enumerate() {
            let path = format!("$.resources.points[{index}]");
            self.validate_required_text(&format!("{path}.id"), &point.id, "点位 ID");
            self.validate_required_text(&format!("{path}.name"), &point.name, "点位名称");
            if !point.id.trim().is_empty() && !self.point_ids.insert(point.id.clone()) {
                self.error(
                    format!("{path}.id"),
                    "duplicatePointId",
                    format!("点位 ID '{}' 重复", point.id),
                );
            }
            if let PointLocation::WindowRelative { x, y } = point.location
                && (!x.is_finite()
                    || !y.is_finite()
                    || !(0.0..=1.0).contains(&x)
                    || !(0.0..=1.0).contains(&y))
            {
                self.error(
                    format!("{path}.location"),
                    "invalidRelativePoint",
                    "窗口相对坐标必须是 0 到 1 之间的有限数值",
                );
            }
        }

        for (index, detector) in resources.detectors.iter().enumerate() {
            let path = format!("$.resources.detectors[{index}]");
            self.validate_required_text(&format!("{path}.id"), &detector.id, "识别器 ID");
            self.validate_required_text(&format!("{path}.name"), &detector.name, "识别器名称");
            if !detector.id.trim().is_empty() && !self.detector_ids.insert(detector.id.clone()) {
                self.error(
                    format!("{path}.id"),
                    "duplicateDetectorId",
                    format!("识别器 ID '{}' 重复", detector.id),
                );
            }
            let region = detector.search_region;
            let values = [region.x, region.y, region.width, region.height];
            if values.iter().any(|value| !value.is_finite())
                || region.x < 0.0
                || region.y < 0.0
                || region.width <= 0.0
                || region.height <= 0.0
                || region.x + region.width > 1.0 + f64::EPSILON
                || region.y + region.height > 1.0 + f64::EPSILON
            {
                self.error(
                    format!("{path}.searchRegion"),
                    "invalidSearchRegion",
                    "识别区域必须是位于目标窗口内的有效归一化矩形",
                );
            }
            self.validate_required_text(
                &format!("{path}.template.assetId"),
                &detector.template.asset_id,
                "模板资源 ID",
            );
            if !detector.template.asset_id.trim().is_empty() {
                if detector.template.width < 4 || detector.template.height < 4 {
                    self.error(
                        format!("{path}.template"),
                        "templateTooSmall",
                        "识别模板宽高不能小于 4 像素",
                    );
                }
                if detector.template.capture_reference_width == 0
                    || detector.template.capture_reference_height == 0
                {
                    self.error(
                        format!("{path}.template"),
                        "missingCaptureReferenceSize",
                        "已配置模板必须记录采集预览的参考宽高",
                    );
                }
            }
            if let Some(mask_asset_id) = &detector.template.mask_asset_id {
                self.validate_required_text(
                    &format!("{path}.template.maskAssetId"),
                    mask_asset_id,
                    "遮罩资源 ID",
                );
            }
            if !detector.match_threshold.is_finite()
                || !(0.0..=1.0).contains(&detector.match_threshold)
                || detector.match_threshold == 0.0
            {
                self.error(
                    format!("{path}.matchThreshold"),
                    "invalidMatchThreshold",
                    "匹配阈值必须是大于 0 且不大于 1 的有限数值",
                );
            }
            if detector.confirm_frames == 0 || detector.confirm_frames > MAX_DETECTOR_STABLE_FRAMES
            {
                self.error(
                    format!("{path}.confirmFrames"),
                    "invalidConfirmFrames",
                    format!("连续确认帧数必须为 1 到 {MAX_DETECTOR_STABLE_FRAMES}"),
                );
            }
            if detector.missing_frames == 0 || detector.missing_frames > MAX_DETECTOR_STABLE_FRAMES
            {
                self.error(
                    format!("{path}.missingFrames"),
                    "invalidMissingFrames",
                    format!("连续缺失帧数必须为 1 到 {MAX_DETECTOR_STABLE_FRAMES}"),
                );
            }
            if detector.stale_after_ms == 0 {
                self.error(
                    format!("{path}.staleAfterMs"),
                    "zeroStaleTimeout",
                    "识别结果过期时间必须大于 0",
                );
            } else if detector.stale_after_ms < MIN_DETECTOR_STALE_AFTER_MS {
                self.warning(
                    format!("{path}.staleAfterMs"),
                    "staleTimeoutTooShort",
                    format!(
                        "识别结果过期时间低于 {MIN_DETECTOR_STALE_AFTER_MS} 毫秒，可能在相邻截图帧之间频繁变为未知"
                    ),
                );
            }
        }

        for (index, parameter) in resources.parameters.iter().enumerate() {
            let path = format!("$.resources.parameters[{index}]");
            self.validate_required_text(&format!("{path}.id"), &parameter.id, "参数 ID");
            self.validate_required_text(&format!("{path}.name"), &parameter.name, "参数名称");
            if !parameter.id.trim().is_empty()
                && self
                    .parameters
                    .insert(parameter.id.clone(), parameter.clone())
                    .is_some()
            {
                self.error(
                    format!("{path}.id"),
                    "duplicateParameterId",
                    format!("参数 ID '{}' 重复", parameter.id),
                );
            }
            self.validate_safe_integer(
                parameter.default_value,
                &format!("{path}.defaultValue"),
                "参数默认值",
            );
            self.validate_safe_integer(
                parameter.min_value,
                &format!("{path}.minValue"),
                "参数最小值",
            );
            self.validate_safe_integer(
                parameter.max_value,
                &format!("{path}.maxValue"),
                "参数最大值",
            );
            if parameter.min_value > parameter.max_value {
                self.error(
                    format!("{path}.minValue"),
                    "invalidParameterRange",
                    "参数最小值不能大于最大值",
                );
            } else if !(parameter.min_value..=parameter.max_value)
                .contains(&parameter.default_value)
            {
                self.error(
                    format!("{path}.defaultValue"),
                    "parameterDefaultOutOfRange",
                    "参数默认值超出允许范围",
                );
            }
        }

        for (index, counter) in resources.counters.iter().enumerate() {
            let path = format!("$.resources.counters[{index}]");
            self.validate_required_text(&format!("{path}.id"), &counter.id, "计数器 ID");
            self.validate_required_text(&format!("{path}.name"), &counter.name, "计数器名称");
            if !counter.id.trim().is_empty() && !self.counter_ids.insert(counter.id.clone()) {
                self.error(
                    format!("{path}.id"),
                    "duplicateCounterId",
                    format!("计数器 ID '{}' 重复", counter.id),
                );
            }
            self.validate_safe_integer(
                counter.initial_value,
                &format!("{path}.initialValue"),
                "计数器初始值",
            );
        }
    }

    fn validate_step(&mut self, step: &WorkflowStep, path: &str, depth: usize) {
        self.node_count = self.node_count.saturating_add(1);
        if depth > MAX_WORKFLOW_DEPTH {
            self.error(
                path,
                "workflowTooDeep",
                format!("流程嵌套不能超过 {MAX_WORKFLOW_DEPTH} 层"),
            );
            return;
        }

        self.validate_required_text(&format!("{path}.id"), &step.id, "步骤 ID");
        if !step.id.trim().is_empty() && !self.step_ids.insert(step.id.clone()) {
            self.error(
                format!("{path}.id"),
                "duplicateStepId",
                format!("步骤 ID '{}' 重复", step.id),
            );
        }
        if let Some(label) = &step.label {
            self.validate_required_text(&format!("{path}.label"), label, "步骤标签");
        }

        match &step.node {
            WorkflowNode::Sequence { steps } => {
                if steps.is_empty() {
                    self.warning(path, "emptySequence", "步骤组为空，不会执行任何操作");
                }
                for (index, step) in steps.iter().enumerate() {
                    self.validate_step(step, &format!("{path}.steps[{index}]"), depth + 1);
                }
            }
            WorkflowNode::Click {
                point_id,
                click_count,
                ..
            } => {
                if !self.point_ids.contains(point_id.as_str()) {
                    self.error(
                        format!("{path}.pointId"),
                        "unknownPoint",
                        format!("找不到点位资源 '{point_id}'"),
                    );
                }
                if !(1..=MAX_CLICK_COUNT).contains(click_count) {
                    self.error(
                        format!("{path}.clickCount"),
                        "invalidClickCount",
                        format!("单个点击步骤只允许 1 到 {MAX_CLICK_COUNT} 次点击"),
                    );
                }
            }
            WorkflowNode::Key { chord } => {
                if chord.keys.is_empty() || chord.keys.len() > MAX_KEY_CHORD_KEYS {
                    self.error(
                        format!("{path}.chord.keys"),
                        "invalidKeyCount",
                        format!("组合键必须包含 1 到 {MAX_KEY_CHORD_KEYS} 个按键"),
                    );
                }
                let mut main_key_count = 0;
                for (index, key) in chord.keys.iter().enumerate() {
                    self.validate_required_text(
                        &format!("{path}.chord.keys[{index}]"),
                        key,
                        "按键名称",
                    );
                    let trimmed = key.trim();
                    let is_modifier = trimmed.eq_ignore_ascii_case("ctrl")
                        || trimmed.eq_ignore_ascii_case("control")
                        || trimmed.eq_ignore_ascii_case("commandorcontrol")
                        || trimmed.eq_ignore_ascii_case("alt")
                        || trimmed.eq_ignore_ascii_case("shift");
                    if !trimmed.is_empty() && !is_modifier {
                        main_key_count += 1;
                        let normalized = normalize_key(trimmed);
                        if virtual_key_code(&normalized).is_none() {
                            self.error(
                                format!("{path}.chord.keys[{index}]"),
                                "unsupportedKey",
                                format!("不支持的按键：{trimmed}"),
                            );
                        }
                    }
                }
                if main_key_count != 1 {
                    self.error(
                        format!("{path}.chord.keys"),
                        "invalidMainKeyCount",
                        "组合键必须且只能包含一个主按键",
                    );
                }
                if chord.hold_ms > MAX_KEY_HOLD_MS {
                    self.error(
                        format!("{path}.chord.holdMs"),
                        "invalidKeyHold",
                        format!("按键按住时长不能超过 {MAX_KEY_HOLD_MS} 毫秒"),
                    );
                }
            }
            WorkflowNode::Delay { duration_ms } => self.validate_expression(
                duration_ms,
                &format!("{path}.durationMs"),
                ExpressionConstraint::NonNegative,
            ),
            WorkflowNode::If {
                condition,
                then_branch,
                else_branch,
            } => {
                self.validate_condition(condition, &format!("{path}.condition"), depth + 1);
                self.validate_step(then_branch, &format!("{path}.thenBranch"), depth + 1);
                if let Some(else_branch) = else_branch {
                    self.validate_step(else_branch, &format!("{path}.elseBranch"), depth + 1);
                }
            }
            WorkflowNode::Repeat {
                count,
                max_iterations,
                body,
            } => {
                self.validate_expression(
                    count,
                    &format!("{path}.count"),
                    ExpressionConstraint::NonNegative,
                );
                self.validate_loop_limit(*max_iterations, &format!("{path}.maxIterations"));
                if let Some((_, maximum)) = self.expression_bounds(count)
                    && maximum > i64::from(*max_iterations)
                {
                    self.error(
                        format!("{path}.count"),
                        "repeatExceedsLimit",
                        "重复次数允许范围超过该节点的 maxIterations",
                    );
                }
                self.validate_step(body, &format!("{path}.body"), depth + 1);
            }
            WorkflowNode::RepeatUntil {
                condition,
                body,
                timeout_ms,
                poll_interval_ms,
                max_iterations,
            } => {
                self.validate_condition(condition, &format!("{path}.condition"), depth + 1);
                self.validate_expression(
                    timeout_ms,
                    &format!("{path}.timeoutMs"),
                    ExpressionConstraint::Positive,
                );
                self.validate_expression(
                    poll_interval_ms,
                    &format!("{path}.pollIntervalMs"),
                    ExpressionConstraint::Positive,
                );
                self.validate_loop_limit(*max_iterations, &format!("{path}.maxIterations"));
                self.validate_step(body, &format!("{path}.body"), depth + 1);
            }
            WorkflowNode::WaitUntil {
                condition,
                timeout_ms,
                poll_interval_ms,
            } => {
                self.validate_condition(condition, &format!("{path}.condition"), depth + 1);
                self.validate_expression(
                    timeout_ms,
                    &format!("{path}.timeoutMs"),
                    ExpressionConstraint::Positive,
                );
                self.validate_expression(
                    poll_interval_ms,
                    &format!("{path}.pollIntervalMs"),
                    ExpressionConstraint::Positive,
                );
            }
            WorkflowNode::CounterAdd { counter_id, amount } => {
                if !self.counter_ids.contains(counter_id.as_str()) {
                    self.error(
                        format!("{path}.counterId"),
                        "unknownCounter",
                        format!("找不到计数器资源 '{counter_id}'"),
                    );
                }
                self.validate_expression(
                    amount,
                    &format!("{path}.amount"),
                    ExpressionConstraint::Any,
                );
            }
            WorkflowNode::Assert { condition, message } => {
                self.validate_condition(condition, &format!("{path}.condition"), depth + 1);
                self.validate_required_text(&format!("{path}.message"), message, "断言提示");
            }
            WorkflowNode::Log { message } => {
                self.validate_required_text(&format!("{path}.message"), message, "日志内容");
            }
            WorkflowNode::Finish { message, .. } => {
                if message
                    .as_ref()
                    .is_some_and(|value| value.trim().is_empty())
                {
                    self.warning(
                        format!("{path}.message"),
                        "emptyFinishMessage",
                        "结束提示为空，建议删除该字段或填写内容",
                    );
                }
            }
        }
    }

    fn validate_condition(&mut self, condition: &Condition, path: &str, depth: usize) {
        if depth > MAX_WORKFLOW_DEPTH {
            self.error(
                path,
                "conditionTooDeep",
                format!("条件嵌套不能超过 {MAX_WORKFLOW_DEPTH} 层"),
            );
            return;
        }
        match condition {
            Condition::DetectorState { detector_id, state } => {
                if !self.detector_ids.contains(detector_id.as_str()) {
                    self.error(
                        format!("{path}.detectorId"),
                        "unknownDetector",
                        format!("找不到识别器资源 '{detector_id}'"),
                    );
                }
                if *state == DetectorState::Unknown {
                    self.error(
                        format!("{path}.state"),
                        "unsafeUnknownDetectorCondition",
                        "识别器的“未知”状态不能作为执行条件；请改为“出现”或“消失”",
                    );
                }
            }
            Condition::CounterCompare {
                counter_id, value, ..
            } => {
                if !self.counter_ids.contains(counter_id.as_str()) {
                    self.error(
                        format!("{path}.counterId"),
                        "unknownCounter",
                        format!("找不到计数器资源 '{counter_id}'"),
                    );
                }
                self.validate_expression(
                    value,
                    &format!("{path}.value"),
                    ExpressionConstraint::Any,
                );
            }
            Condition::All { conditions } | Condition::Any { conditions } => {
                if conditions.is_empty() {
                    self.warning(
                        path,
                        "emptyConditionGroup",
                        "空条件组的结果是固定值，建议显式填写条件",
                    );
                }
                for (index, child) in conditions.iter().enumerate() {
                    self.validate_condition(
                        child,
                        &format!("{path}.conditions[{index}]"),
                        depth + 1,
                    );
                }
            }
            Condition::Not { condition } => {
                self.validate_condition(condition, &format!("{path}.condition"), depth + 1);
            }
            Condition::TargetState { .. } => {}
        }
    }

    fn validate_expression(
        &mut self,
        expression: &NumberExpression,
        path: &str,
        constraint: ExpressionConstraint,
    ) {
        match expression {
            NumberExpression::Literal { value } => {
                self.validate_safe_integer(*value, path, "固定数值");
                self.validate_expression_range(*value, *value, path, constraint);
            }
            NumberExpression::Parameter { parameter_id } => {
                let Some(parameter) = self.parameters.get(parameter_id.as_str()) else {
                    self.error(
                        format!("{path}.parameterId"),
                        "unknownParameter",
                        format!("找不到参数资源 '{parameter_id}'"),
                    );
                    return;
                };
                let min_value = parameter.min_value;
                let max_value = parameter.max_value;
                self.validate_expression_range(min_value, max_value, path, constraint);
            }
            NumberExpression::Counter { counter_id } => {
                if !self.counter_ids.contains(counter_id.as_str()) {
                    self.error(
                        format!("{path}.counterId"),
                        "unknownCounter",
                        format!("找不到计数器资源 '{counter_id}'"),
                    );
                } else if constraint != ExpressionConstraint::Any {
                    self.warning(
                        path,
                        "runtimeCheckedCounterValue",
                        "计数器值只能在运行时检查是否满足非负或正数约束",
                    );
                }
            }
        }
    }

    fn validate_expression_range(
        &mut self,
        min: i64,
        max: i64,
        path: &str,
        constraint: ExpressionConstraint,
    ) {
        let invalid = match constraint {
            ExpressionConstraint::Any => false,
            ExpressionConstraint::NonNegative => min < 0,
            ExpressionConstraint::Positive => min <= 0,
        };
        if invalid {
            let message = match constraint {
                ExpressionConstraint::Any => return,
                ExpressionConstraint::NonNegative => "该数值在所有允许配置下都必须大于或等于 0",
                ExpressionConstraint::Positive => "该数值在所有允许配置下都必须大于 0",
            };
            self.error(path, "invalidExpressionRange", message);
        }
        if max < min {
            self.error(path, "invalidExpressionRange", "数值表达式范围无效");
        }
    }

    fn expression_bounds(&self, expression: &NumberExpression) -> Option<(i64, i64)> {
        match expression {
            NumberExpression::Literal { value } => Some((*value, *value)),
            NumberExpression::Parameter { parameter_id } => self
                .parameters
                .get(parameter_id.as_str())
                .map(|parameter| (parameter.min_value, parameter.max_value)),
            NumberExpression::Counter { .. } => None,
        }
    }

    fn validate_loop_limit(&mut self, value: u32, path: &str) {
        if value == 0 || value > MAX_LOOP_ITERATIONS {
            self.error(
                path,
                "invalidLoopLimit",
                format!("maxIterations 必须在 1 到 {MAX_LOOP_ITERATIONS} 之间"),
            );
        }
    }

    fn validate_required_text(&mut self, path: &str, value: &str, label: &str) {
        let trimmed = value.trim();
        if trimmed.is_empty() {
            self.error(path, "required", format!("{label}不能为空"));
        } else if trimmed.len() > 256 {
            self.error(path, "textTooLong", format!("{label}不能超过 256 个字符"));
        } else if trimmed.chars().any(char::is_control) {
            self.error(path, "invalidText", format!("{label}不能包含控制字符"));
        }
    }

    fn validate_safe_integer(&mut self, value: i64, path: &str, label: &str) {
        if !(MIN_JS_SAFE_INTEGER..=MAX_JS_SAFE_INTEGER).contains(&value) {
            self.error(
                path,
                "unsafeInteger",
                format!(
                    "{label}必须在 {MIN_JS_SAFE_INTEGER} 到 {MAX_JS_SAFE_INTEGER} 之间，才能在编辑器中精确表示"
                ),
            );
        }
    }

    fn error(
        &mut self,
        path: impl Into<String>,
        code: impl Into<String>,
        message: impl Into<String>,
    ) {
        self.diagnostics.push(Diagnostic {
            path: path.into(),
            severity: DiagnosticSeverity::Error,
            code: code.into(),
            message: message.into(),
        });
    }

    fn warning(
        &mut self,
        path: impl Into<String>,
        code: impl Into<String>,
        message: impl Into<String>,
    ) {
        self.diagnostics.push(Diagnostic {
            path: path.into(),
            severity: DiagnosticSeverity::Warning,
            code: code.into(),
            message: message.into(),
        });
    }
}

#[derive(Clone, Copy, Eq, PartialEq)]
enum ExpressionConstraint {
    Any,
    NonNegative,
    Positive,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::visual_workflow::model::{
        CompareOperator, CounterResource, DetectorResource, DetectorState, DetectorTemplateRef,
        NormalizedRegion, NumberParameter, PointResource, SafetyGuard, WorkflowResources,
    };

    fn workflow(root: WorkflowNode) -> WorkflowDefinition {
        WorkflowDefinition {
            schema_version: WORKFLOW_SCHEMA_VERSION,
            id: "trade-loop".into(),
            name: "交易行循环抢购".into(),
            description: None,
            target: Some(super::super::model::WorkflowTarget {
                process_name: "game.exe".into(),
                window_title: "Game".into(),
                class_name: "GameWindow".into(),
                reference_width: 1_280,
                reference_height: 720,
            }),
            resources: WorkflowResources {
                points: vec![PointResource {
                    id: "record".into(),
                    name: "搜索记录商品".into(),
                    location: PointLocation::WindowRelative { x: 0.5, y: 0.5 },
                }],
                detectors: vec![DetectorResource {
                    id: "purchase".into(),
                    name: "购买图标".into(),
                    search_region: NormalizedRegion {
                        x: 0.5,
                        y: 0.5,
                        width: 0.2,
                        height: 0.2,
                    },
                    template: DetectorTemplateRef {
                        asset_id: "purchase.png".into(),
                        mask_asset_id: None,
                        width: 20,
                        height: 20,
                        capture_reference_width: 1_280,
                        capture_reference_height: 720,
                    },
                    match_threshold: 0.95,
                    confirm_frames: 2,
                    missing_frames: 2,
                    stale_after_ms: 250,
                }],
                parameters: vec![NumberParameter {
                    id: "purchaseCount".into(),
                    name: "购买次数".into(),
                    default_value: 1,
                    min_value: 1,
                    max_value: 999,
                }],
                counters: vec![CounterResource {
                    id: "completed".into(),
                    name: "已点击购买".into(),
                    initial_value: 0,
                }],
            },
            safety_guards: vec![SafetyGuard {
                condition: Condition::TargetState {
                    state: super::super::model::TargetState::Exists,
                    expected: false,
                },
                message: "目标窗口已关闭".into(),
            }],
            root: step("root", root),
        }
    }

    fn step(id: &str, node: WorkflowNode) -> WorkflowStep {
        WorkflowStep {
            id: id.into(),
            label: None,
            enabled: true,
            node,
        }
    }

    #[test]
    fn accepts_bounded_purchase_loop() {
        let root = WorkflowNode::Repeat {
            count: NumberExpression::Parameter {
                parameter_id: "purchaseCount".into(),
            },
            max_iterations: 999,
            body: Box::new(step(
                "find-purchase",
                WorkflowNode::RepeatUntil {
                    condition: Condition::DetectorState {
                        detector_id: "purchase".into(),
                        state: DetectorState::Present,
                    },
                    body: Box::new(step(
                        "click-loop",
                        WorkflowNode::Sequence {
                            steps: vec![
                                step(
                                    "click-record",
                                    WorkflowNode::Click {
                                        point_id: "record".into(),
                                        button: Default::default(),
                                        click_count: 1,
                                    },
                                ),
                                step(
                                    "click-delay",
                                    WorkflowNode::Delay {
                                        duration_ms: NumberExpression::Literal { value: 50 },
                                    },
                                ),
                            ],
                        },
                    )),
                    timeout_ms: NumberExpression::Literal { value: 60_000 },
                    poll_interval_ms: NumberExpression::Literal { value: 25 },
                    max_iterations: 3_000,
                },
            )),
        };
        let diagnostics = validate_workflow(&workflow(root));
        assert!(!has_errors(&diagnostics), "{diagnostics:#?}");
    }

    #[test]
    fn reports_paths_for_missing_resources_and_unbounded_values() {
        let root = WorkflowNode::Sequence {
            steps: vec![
                step(
                    "bad-click",
                    WorkflowNode::Click {
                        point_id: "missing".into(),
                        button: Default::default(),
                        click_count: 9,
                    },
                ),
                step(
                    "bad-wait",
                    WorkflowNode::WaitUntil {
                        condition: Condition::CounterCompare {
                            counter_id: "completed".into(),
                            operator: CompareOperator::GreaterThan,
                            value: NumberExpression::Literal { value: 0 },
                        },
                        timeout_ms: NumberExpression::Literal { value: -1 },
                        poll_interval_ms: NumberExpression::Literal { value: 0 },
                    },
                ),
            ],
        };
        let diagnostics = validate_workflow(&workflow(root));
        assert!(
            diagnostics.iter().any(|item| {
                item.path == "$.root.steps[0].pointId" && item.code == "unknownPoint"
            })
        );
        assert!(diagnostics.iter().any(|item| {
            item.path == "$.root.steps[1].timeoutMs" && item.code == "invalidExpressionRange"
        }));
        assert!(diagnostics.iter().any(|item| {
            item.path == "$.root.steps[1].pollIntervalMs" && item.code == "invalidExpressionRange"
        }));
    }

    #[test]
    fn rejects_invalid_detector_region_and_parameter_range() {
        let mut workflow = workflow(WorkflowNode::Log {
            message: "ready".into(),
        });
        workflow.resources.detectors[0].search_region.width = 0.8;
        workflow.resources.parameters[0].default_value = 1_000;
        let diagnostics = validate_workflow(&workflow);
        assert!(
            diagnostics
                .iter()
                .any(|item| item.code == "invalidSearchRegion")
        );
        assert!(
            diagnostics
                .iter()
                .any(|item| item.code == "parameterDefaultOutOfRange")
        );
    }

    #[test]
    fn configured_templates_require_capture_reference_dimensions() {
        let mut definition = workflow(WorkflowNode::Log {
            message: "ready".into(),
        });
        definition.resources.detectors[0]
            .template
            .capture_reference_width = 0;
        let diagnostics = validate_workflow(&definition);
        assert!(
            diagnostics
                .iter()
                .any(|item| item.code == "missingCaptureReferenceSize")
        );
    }

    #[test]
    fn unconfigured_templates_do_not_report_dimension_errors() {
        let mut definition = workflow(WorkflowNode::Log {
            message: "ready".into(),
        });
        definition.resources.detectors[0].template = DetectorTemplateRef {
            asset_id: String::new(),
            mask_asset_id: None,
            width: 0,
            height: 0,
            capture_reference_width: 0,
            capture_reference_height: 0,
        };
        let diagnostics = validate_workflow(&definition);
        assert!(
            diagnostics
                .iter()
                .all(|item| item.code != "templateTooSmall"
                    && item.code != "missingCaptureReferenceSize")
        );
    }

    #[test]
    fn rejects_excessive_key_hold_duration_before_execution() {
        let definition = workflow(WorkflowNode::Key {
            chord: super::super::model::KeyChord {
                keys: vec!["F".into()],
                hold_ms: MAX_KEY_HOLD_MS + 1,
            },
        });
        let diagnostics = validate_workflow(&definition);
        assert!(diagnostics.iter().any(|item| item.code == "invalidKeyHold"));
    }

    #[test]
    fn input_workflows_require_a_bound_target_and_supported_single_main_key() {
        let mut definition = workflow(WorkflowNode::Key {
            chord: super::super::model::KeyChord {
                keys: vec!["Ctrl".into(), "A".into(), "B".into()],
                hold_ms: 0,
            },
        });
        definition.target = None;
        let diagnostics = validate_workflow(&definition);
        assert!(diagnostics.iter().any(|item| item.code == "missingTarget"));
        assert!(
            diagnostics
                .iter()
                .any(|item| item.code == "invalidMainKeyCount")
        );
    }

    #[test]
    fn targets_require_a_complete_window_identity() {
        let mut definition = workflow(WorkflowNode::Log {
            message: "noop".into(),
        });
        let target = definition.target.as_mut().unwrap();
        target.window_title.clear();
        target.class_name.clear();

        let diagnostics = validate_workflow(&definition);
        assert!(
            diagnostics
                .iter()
                .any(|item| item.path == "$.target.windowTitle" && item.code == "required")
        );
        assert!(
            diagnostics
                .iter()
                .any(|item| item.path == "$.target.className" && item.code == "required")
        );
    }

    #[test]
    fn rejects_unknown_as_a_detector_condition() {
        let definition = workflow(WorkflowNode::If {
            condition: Condition::DetectorState {
                detector_id: "purchase".into(),
                state: DetectorState::Unknown,
            },
            then_branch: Box::new(step(
                "unsafe-click",
                WorkflowNode::Click {
                    point_id: "record".into(),
                    button: Default::default(),
                    click_count: 1,
                },
            )),
            else_branch: None,
        });
        let diagnostics = validate_workflow(&definition);
        assert!(
            diagnostics
                .iter()
                .any(|item| item.code == "unsafeUnknownDetectorCondition")
        );
    }

    #[test]
    fn rejects_values_outside_the_editor_safe_integer_range() {
        let mut definition = workflow(WorkflowNode::Delay {
            duration_ms: NumberExpression::Literal {
                value: MAX_JS_SAFE_INTEGER + 1,
            },
        });
        definition.resources.parameters[0].max_value = MAX_JS_SAFE_INTEGER + 1;
        definition.resources.counters[0].initial_value = MIN_JS_SAFE_INTEGER - 1;

        let diagnostics = validate_workflow(&definition);
        assert!(
            diagnostics
                .iter()
                .any(|item| { item.path == "$.root.durationMs" && item.code == "unsafeInteger" })
        );
        assert!(diagnostics.iter().any(|item| {
            item.path == "$.resources.parameters[0].maxValue" && item.code == "unsafeInteger"
        }));
        assert!(diagnostics.iter().any(|item| {
            item.path == "$.resources.counters[0].initialValue" && item.code == "unsafeInteger"
        }));
    }

    #[test]
    fn repeat_parameter_range_must_fit_node_limit() {
        let root = WorkflowNode::Repeat {
            count: NumberExpression::Parameter {
                parameter_id: "purchaseCount".into(),
            },
            max_iterations: 10,
            body: Box::new(step(
                "write-log",
                WorkflowNode::Log {
                    message: "tick".into(),
                },
            )),
        };
        let diagnostics = validate_workflow(&workflow(root));
        assert!(
            diagnostics
                .iter()
                .any(|item| item.code == "repeatExceedsLimit")
        );
    }
}
