use std::{
    collections::{BTreeMap, HashMap},
    error::Error,
    fmt,
};

use serde::{Deserialize, Serialize};

use super::{
    model::{
        CompareOperator, Condition, DetectorResource, DetectorState, Diagnostic, FinishOutcome,
        KeyChord, MouseButton, NumberExpression, PointResource, SafetyGuard, TargetState,
        TruthValue, WorkflowDefinition, WorkflowNode, WorkflowStep,
    },
    validate::{has_errors, validate_workflow},
};

pub trait WorkflowClock {
    fn now_ms(&self) -> u64;
    fn sleep_ms(&mut self, duration_ms: u64);
}

pub trait WorkflowInput {
    fn click(
        &mut self,
        point: &PointResource,
        button: MouseButton,
        click_count: u8,
    ) -> Result<(), String>;

    fn key(&mut self, chord: &KeyChord) -> Result<(), String>;
}

pub trait WorkflowVision {
    fn detector_state(&mut self, detector: &DetectorResource) -> DetectorState;
    fn target_state(&mut self, state: TargetState) -> TruthValue;
}

pub trait ExecutionControl {
    fn is_cancelled(&self) -> bool {
        false
    }

    fn on_event(&mut self, _event: &ExecutionEvent) {}
}

#[derive(Default)]
pub struct NoopExecutionControl;

impl ExecutionControl for NoopExecutionControl {}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionInputs {
    #[serde(default)]
    pub parameter_values: BTreeMap<String, i64>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionLimits {
    pub max_executed_nodes: u64,
    pub max_loop_iterations: u64,
    pub max_total_duration_ms: u64,
    pub sleep_slice_ms: u64,
}

impl Default for ExecutionLimits {
    fn default() -> Self {
        Self {
            max_executed_nodes: 100_000,
            max_loop_iterations: 1_000_000,
            max_total_duration_ms: 30 * 60 * 1_000,
            sleep_slice_ms: 25,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionEvent {
    pub timestamp_ms: u64,
    pub path: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub step_id: Option<String>,
    pub kind: ExecutionEventKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ExecutionEventKind {
    StepStarted,
    Log,
    Finished,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ExecutionStatus {
    Succeeded,
    Failed,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionReport {
    pub status: ExecutionStatus,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    pub elapsed_ms: u64,
    pub executed_nodes: u64,
    pub loop_iterations: u64,
    pub counters: BTreeMap<String, i64>,
    pub events: Vec<ExecutionEvent>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ExecutionErrorKind {
    InvalidWorkflow,
    InvalidInputs,
    MissingResource,
    InputFailed,
    Timeout,
    LoopLimitExceeded,
    AssertionFailed,
    GuardTriggered,
    Cancelled,
    BudgetExceeded,
    ArithmeticOverflow,
    IndeterminateCondition,
    InvalidRuntimeValue,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionError {
    pub kind: ExecutionErrorKind,
    pub path: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub diagnostics: Vec<Diagnostic>,
}

impl fmt::Display for ExecutionError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{} ({})", self.message, self.path)
    }
}

impl Error for ExecutionError {}

pub struct Interpreter<'a, C, I, V, R> {
    clock: &'a mut C,
    input: &'a mut I,
    vision: &'a mut V,
    control: &'a mut R,
    limits: ExecutionLimits,
}

impl<'a, C, I, V, R> Interpreter<'a, C, I, V, R>
where
    C: WorkflowClock,
    I: WorkflowInput,
    V: WorkflowVision,
    R: ExecutionControl,
{
    pub fn new(clock: &'a mut C, input: &'a mut I, vision: &'a mut V, control: &'a mut R) -> Self {
        Self {
            clock,
            input,
            vision,
            control,
            limits: ExecutionLimits::default(),
        }
    }

    pub fn with_limits(mut self, limits: ExecutionLimits) -> Self {
        self.limits = limits;
        self
    }

    pub fn run_with_defaults(
        &mut self,
        workflow: &WorkflowDefinition,
    ) -> Result<ExecutionReport, ExecutionError> {
        self.run(workflow, &ExecutionInputs::default())
    }

    pub fn run(
        &mut self,
        workflow: &WorkflowDefinition,
        inputs: &ExecutionInputs,
    ) -> Result<ExecutionReport, ExecutionError> {
        let diagnostics = validate_workflow(workflow);
        if has_errors(&diagnostics) {
            return Err(ExecutionError {
                kind: ExecutionErrorKind::InvalidWorkflow,
                path: "$".into(),
                message: format!(
                    "流程静态校验失败，共有 {} 个错误",
                    diagnostics
                        .iter()
                        .filter(|item| { item.severity == super::model::DiagnosticSeverity::Error })
                        .count()
                ),
                diagnostics,
            });
        }

        let start_ms = self.clock.now_ms();
        let mut state = RunState::new(workflow, inputs, start_ms)?;
        let flow = self.execute_step(&workflow.root, "$.root", &mut state)?;
        let (status, message) = match flow {
            ControlFlow::Continue => (ExecutionStatus::Succeeded, None),
            ControlFlow::Finish { outcome, message } => (
                match outcome {
                    FinishOutcome::Success => ExecutionStatus::Succeeded,
                    FinishOutcome::Failure => ExecutionStatus::Failed,
                },
                message,
            ),
        };
        Ok(ExecutionReport {
            status,
            message,
            elapsed_ms: self.clock.now_ms().saturating_sub(start_ms),
            executed_nodes: state.executed_nodes,
            loop_iterations: state.loop_iterations,
            counters: state.counters,
            events: state.events,
        })
    }

    fn execute_step(
        &mut self,
        step: &WorkflowStep,
        path: &str,
        state: &mut RunState,
    ) -> Result<ControlFlow, ExecutionError> {
        self.checkpoint(path, state)?;
        if !step.enabled {
            return Ok(ControlFlow::Continue);
        }

        state.executed_nodes = state.executed_nodes.saturating_add(1);
        if state.executed_nodes > self.limits.max_executed_nodes {
            return Err(runtime_error(
                ExecutionErrorKind::BudgetExceeded,
                path,
                "执行节点数量超过运行预算",
            ));
        }
        self.emit(
            state,
            path,
            Some(&step.id),
            ExecutionEventKind::StepStarted,
            step.label.clone(),
        );

        match &step.node {
            WorkflowNode::Sequence { steps } => {
                for (index, child) in steps.iter().enumerate() {
                    let flow =
                        self.execute_step(child, &format!("{path}.steps[{index}]"), state)?;
                    if let ControlFlow::Finish { .. } = flow {
                        return Ok(flow);
                    }
                }
                Ok(ControlFlow::Continue)
            }
            WorkflowNode::Click {
                point_id,
                button,
                click_count,
            } => {
                let point = state.points.get(point_id).cloned().ok_or_else(|| {
                    runtime_error(
                        ExecutionErrorKind::MissingResource,
                        format!("{path}.pointId"),
                        format!("找不到点位资源 '{point_id}'"),
                    )
                })?;
                self.input
                    .click(&point, *button, *click_count)
                    .map_err(|message| {
                        runtime_error(ExecutionErrorKind::InputFailed, path, message)
                    })?;
                self.checkpoint(path, state)?;
                Ok(ControlFlow::Continue)
            }
            WorkflowNode::Key { chord } => {
                self.input.key(chord).map_err(|message| {
                    runtime_error(ExecutionErrorKind::InputFailed, path, message)
                })?;
                self.checkpoint(path, state)?;
                Ok(ControlFlow::Continue)
            }
            WorkflowNode::Delay { duration_ms } => {
                let duration =
                    self.eval_duration(duration_ms, &format!("{path}.durationMs"), state)?;
                self.sleep_interruptible(duration, path, state)?;
                Ok(ControlFlow::Continue)
            }
            WorkflowNode::If {
                condition,
                then_branch,
                else_branch,
            } => match self.eval_condition(condition, &format!("{path}.condition"), state)? {
                TruthValue::True => {
                    self.execute_step(then_branch, &format!("{path}.thenBranch"), state)
                }
                TruthValue::False => {
                    if let Some(else_branch) = else_branch {
                        self.execute_step(else_branch, &format!("{path}.elseBranch"), state)
                    } else {
                        Ok(ControlFlow::Continue)
                    }
                }
                TruthValue::Unknown => Err(runtime_error(
                    ExecutionErrorKind::IndeterminateCondition,
                    format!("{path}.condition"),
                    "判断条件当前为未知状态，为避免误操作已停止流程",
                )),
            },
            WorkflowNode::Repeat {
                count,
                max_iterations,
                body,
            } => {
                let count = self.eval_non_negative(count, &format!("{path}.count"), state)?;
                if count > u64::from(*max_iterations) {
                    return Err(runtime_error(
                        ExecutionErrorKind::LoopLimitExceeded,
                        format!("{path}.count"),
                        format!("重复次数 {count} 超过 maxIterations {max_iterations}"),
                    ));
                }
                for index in 0..count {
                    self.consume_iteration(path, state)?;
                    let flow =
                        self.execute_step(body, &format!("{path}.body@iteration[{index}]"), state)?;
                    if let ControlFlow::Finish { .. } = flow {
                        return Ok(flow);
                    }
                }
                Ok(ControlFlow::Continue)
            }
            WorkflowNode::RepeatUntil {
                condition,
                body,
                timeout_ms,
                poll_interval_ms,
                max_iterations,
            } => {
                let timeout =
                    self.eval_positive(timeout_ms, &format!("{path}.timeoutMs"), state)?;
                let poll =
                    self.eval_positive(poll_interval_ms, &format!("{path}.pollIntervalMs"), state)?;
                let started = self.clock.now_ms();
                let mut iterations = 0u64;
                loop {
                    self.checkpoint(path, state)?;
                    if self.clock.now_ms().saturating_sub(started) >= timeout {
                        return Err(runtime_error(
                            ExecutionErrorKind::Timeout,
                            path,
                            format!("重复等待条件超过 {timeout}ms"),
                        ));
                    }
                    match self.eval_condition(condition, &format!("{path}.condition"), state)? {
                        TruthValue::True => break,
                        TruthValue::Unknown => {
                            let remaining =
                                timeout.saturating_sub(self.clock.now_ms().saturating_sub(started));
                            self.sleep_interruptible(poll.min(remaining), path, state)?;
                        }
                        TruthValue::False => {
                            if iterations >= u64::from(*max_iterations) {
                                return Err(runtime_error(
                                    ExecutionErrorKind::LoopLimitExceeded,
                                    path,
                                    format!("重复等待条件已达到 maxIterations {max_iterations}"),
                                ));
                            }
                            self.consume_iteration(path, state)?;
                            let flow = self.execute_step(
                                body,
                                &format!("{path}.body@iteration[{iterations}]"),
                                state,
                            )?;
                            iterations = iterations.saturating_add(1);
                            if let ControlFlow::Finish { .. } = flow {
                                return Ok(flow);
                            }
                        }
                    }
                }
                Ok(ControlFlow::Continue)
            }
            WorkflowNode::WaitUntil {
                condition,
                timeout_ms,
                poll_interval_ms,
            } => {
                let timeout =
                    self.eval_positive(timeout_ms, &format!("{path}.timeoutMs"), state)?;
                let poll =
                    self.eval_positive(poll_interval_ms, &format!("{path}.pollIntervalMs"), state)?;
                let started = self.clock.now_ms();
                loop {
                    self.checkpoint(path, state)?;
                    if self.eval_condition(condition, &format!("{path}.condition"), state)?
                        == TruthValue::True
                    {
                        break;
                    }
                    let elapsed = self.clock.now_ms().saturating_sub(started);
                    if elapsed >= timeout {
                        return Err(runtime_error(
                            ExecutionErrorKind::Timeout,
                            path,
                            format!("等待条件超过 {timeout}ms"),
                        ));
                    }
                    self.sleep_interruptible(poll.min(timeout - elapsed), path, state)?;
                }
                Ok(ControlFlow::Continue)
            }
            WorkflowNode::CounterAdd { counter_id, amount } => {
                let amount = self.eval_number(amount, &format!("{path}.amount"), state)?;
                let value = state.counters.get_mut(counter_id).ok_or_else(|| {
                    runtime_error(
                        ExecutionErrorKind::MissingResource,
                        format!("{path}.counterId"),
                        format!("找不到计数器资源 '{counter_id}'"),
                    )
                })?;
                *value = value.checked_add(amount).ok_or_else(|| {
                    runtime_error(
                        ExecutionErrorKind::ArithmeticOverflow,
                        path,
                        format!("计数器 '{counter_id}' 加法溢出"),
                    )
                })?;
                Ok(ControlFlow::Continue)
            }
            WorkflowNode::Assert { condition, message } => {
                match self.eval_condition(condition, &format!("{path}.condition"), state)? {
                    TruthValue::True => Ok(ControlFlow::Continue),
                    TruthValue::False => Err(runtime_error(
                        ExecutionErrorKind::AssertionFailed,
                        path,
                        message,
                    )),
                    TruthValue::Unknown => Err(runtime_error(
                        ExecutionErrorKind::IndeterminateCondition,
                        path,
                        format!("断言状态未知：{message}"),
                    )),
                }
            }
            WorkflowNode::Log { message } => {
                self.emit(
                    state,
                    path,
                    Some(&step.id),
                    ExecutionEventKind::Log,
                    Some(message.clone()),
                );
                Ok(ControlFlow::Continue)
            }
            WorkflowNode::Finish { outcome, message } => {
                self.emit(
                    state,
                    path,
                    Some(&step.id),
                    ExecutionEventKind::Finished,
                    message.clone(),
                );
                Ok(ControlFlow::Finish {
                    outcome: *outcome,
                    message: message.clone(),
                })
            }
        }
    }

    fn eval_condition(
        &mut self,
        condition: &Condition,
        path: &str,
        state: &mut RunState,
    ) -> Result<TruthValue, ExecutionError> {
        match condition {
            Condition::DetectorState {
                detector_id,
                state: expected,
            } => {
                let detector = state.detectors.get(detector_id).cloned().ok_or_else(|| {
                    runtime_error(
                        ExecutionErrorKind::MissingResource,
                        format!("{path}.detectorId"),
                        format!("找不到识别器资源 '{detector_id}'"),
                    )
                })?;
                let actual = self.vision.detector_state(&detector);
                Ok(match actual {
                    DetectorState::Unknown => TruthValue::Unknown,
                    actual if *expected == actual => TruthValue::True,
                    _ => TruthValue::False,
                })
            }
            Condition::CounterCompare {
                counter_id,
                operator,
                value,
            } => {
                let left = *state.counters.get(counter_id).ok_or_else(|| {
                    runtime_error(
                        ExecutionErrorKind::MissingResource,
                        format!("{path}.counterId"),
                        format!("找不到计数器资源 '{counter_id}'"),
                    )
                })?;
                let right = self.eval_number(value, &format!("{path}.value"), state)?;
                let result = match operator {
                    CompareOperator::Equal => left == right,
                    CompareOperator::NotEqual => left != right,
                    CompareOperator::LessThan => left < right,
                    CompareOperator::LessThanOrEqual => left <= right,
                    CompareOperator::GreaterThan => left > right,
                    CompareOperator::GreaterThanOrEqual => left >= right,
                };
                Ok(if result {
                    TruthValue::True
                } else {
                    TruthValue::False
                })
            }
            Condition::All { conditions } => {
                let mut saw_unknown = false;
                for (index, child) in conditions.iter().enumerate() {
                    match self.eval_condition(
                        child,
                        &format!("{path}.conditions[{index}]"),
                        state,
                    )? {
                        TruthValue::False => return Ok(TruthValue::False),
                        TruthValue::Unknown => saw_unknown = true,
                        TruthValue::True => {}
                    }
                }
                Ok(if saw_unknown {
                    TruthValue::Unknown
                } else {
                    TruthValue::True
                })
            }
            Condition::Any { conditions } => {
                let mut saw_unknown = false;
                for (index, child) in conditions.iter().enumerate() {
                    match self.eval_condition(
                        child,
                        &format!("{path}.conditions[{index}]"),
                        state,
                    )? {
                        TruthValue::True => return Ok(TruthValue::True),
                        TruthValue::Unknown => saw_unknown = true,
                        TruthValue::False => {}
                    }
                }
                Ok(if saw_unknown {
                    TruthValue::Unknown
                } else {
                    TruthValue::False
                })
            }
            Condition::Not { condition } => Ok(self
                .eval_condition(condition, &format!("{path}.condition"), state)?
                .not()),
            Condition::TargetState {
                state: target_state,
                expected,
            } => {
                let value = self.vision.target_state(*target_state);
                Ok(if *expected { value } else { value.not() })
            }
        }
    }

    fn eval_number(
        &self,
        expression: &NumberExpression,
        path: &str,
        state: &RunState,
    ) -> Result<i64, ExecutionError> {
        match expression {
            NumberExpression::Literal { value } => Ok(*value),
            NumberExpression::Parameter { parameter_id } => {
                state.parameters.get(parameter_id).copied().ok_or_else(|| {
                    runtime_error(
                        ExecutionErrorKind::MissingResource,
                        format!("{path}.parameterId"),
                        format!("找不到参数资源 '{parameter_id}'"),
                    )
                })
            }
            NumberExpression::Counter { counter_id } => {
                state.counters.get(counter_id).copied().ok_or_else(|| {
                    runtime_error(
                        ExecutionErrorKind::MissingResource,
                        format!("{path}.counterId"),
                        format!("找不到计数器资源 '{counter_id}'"),
                    )
                })
            }
        }
    }

    fn eval_non_negative(
        &self,
        expression: &NumberExpression,
        path: &str,
        state: &RunState,
    ) -> Result<u64, ExecutionError> {
        let value = self.eval_number(expression, path, state)?;
        u64::try_from(value).map_err(|_| {
            runtime_error(
                ExecutionErrorKind::InvalidRuntimeValue,
                path,
                format!("运行时数值 {value} 不能为负数"),
            )
        })
    }

    fn eval_positive(
        &self,
        expression: &NumberExpression,
        path: &str,
        state: &RunState,
    ) -> Result<u64, ExecutionError> {
        let value = self.eval_non_negative(expression, path, state)?;
        if value == 0 {
            Err(runtime_error(
                ExecutionErrorKind::InvalidRuntimeValue,
                path,
                "运行时数值必须大于 0",
            ))
        } else {
            Ok(value)
        }
    }

    fn eval_duration(
        &self,
        expression: &NumberExpression,
        path: &str,
        state: &RunState,
    ) -> Result<u64, ExecutionError> {
        self.eval_non_negative(expression, path, state)
    }

    fn checkpoint(&mut self, path: &str, state: &mut RunState) -> Result<(), ExecutionError> {
        if self.control.is_cancelled() {
            return Err(runtime_error(
                ExecutionErrorKind::Cancelled,
                path,
                "流程已取消",
            ));
        }
        if self.clock.now_ms().saturating_sub(state.start_ms) > self.limits.max_total_duration_ms {
            return Err(runtime_error(
                ExecutionErrorKind::BudgetExceeded,
                path,
                "流程运行时间超过全局预算",
            ));
        }

        let guards = state.guards.clone();
        for (index, guard) in guards.iter().enumerate() {
            match self.eval_condition(
                &guard.condition,
                &format!("$.safetyGuards[{index}].condition"),
                state,
            )? {
                TruthValue::True => {
                    return Err(runtime_error(
                        ExecutionErrorKind::GuardTriggered,
                        format!("$.safetyGuards[{index}]"),
                        &guard.message,
                    ));
                }
                TruthValue::Unknown => {
                    return Err(runtime_error(
                        ExecutionErrorKind::IndeterminateCondition,
                        format!("$.safetyGuards[{index}]"),
                        format!("安全保护状态未知，为避免误操作已停止：{}", guard.message),
                    ));
                }
                TruthValue::False => {}
            }
        }
        Ok(())
    }

    fn sleep_interruptible(
        &mut self,
        duration_ms: u64,
        path: &str,
        state: &mut RunState,
    ) -> Result<(), ExecutionError> {
        let slice = self.limits.sleep_slice_ms.max(1);
        let mut remaining = duration_ms;
        self.checkpoint(path, state)?;
        while remaining > 0 {
            let current = remaining.min(slice);
            self.clock.sleep_ms(current);
            remaining -= current;
            self.checkpoint(path, state)?;
        }
        Ok(())
    }

    fn consume_iteration(
        &mut self,
        path: &str,
        state: &mut RunState,
    ) -> Result<(), ExecutionError> {
        state.loop_iterations = state.loop_iterations.saturating_add(1);
        if state.loop_iterations > self.limits.max_loop_iterations {
            return Err(runtime_error(
                ExecutionErrorKind::BudgetExceeded,
                path,
                "循环迭代次数超过全局预算",
            ));
        }
        self.checkpoint(path, state)
    }

    fn emit(
        &mut self,
        state: &mut RunState,
        path: &str,
        step_id: Option<&str>,
        kind: ExecutionEventKind,
        message: Option<String>,
    ) {
        let event = ExecutionEvent {
            timestamp_ms: self.clock.now_ms(),
            path: path.into(),
            step_id: step_id.map(str::to_string),
            kind,
            message,
        };
        self.control.on_event(&event);
        state.events.push(event);
    }
}

struct RunState {
    start_ms: u64,
    points: HashMap<String, PointResource>,
    detectors: HashMap<String, DetectorResource>,
    parameters: BTreeMap<String, i64>,
    counters: BTreeMap<String, i64>,
    guards: Vec<SafetyGuard>,
    executed_nodes: u64,
    loop_iterations: u64,
    events: Vec<ExecutionEvent>,
}

impl RunState {
    fn new(
        workflow: &WorkflowDefinition,
        inputs: &ExecutionInputs,
        start_ms: u64,
    ) -> Result<Self, ExecutionError> {
        let points = workflow
            .resources
            .points
            .iter()
            .cloned()
            .map(|item| (item.id.clone(), item))
            .collect();
        let detectors = workflow
            .resources
            .detectors
            .iter()
            .cloned()
            .map(|item| (item.id.clone(), item))
            .collect();
        let mut parameters: BTreeMap<_, _> = workflow
            .resources
            .parameters
            .iter()
            .map(|item| (item.id.clone(), item.default_value))
            .collect();
        for (id, value) in &inputs.parameter_values {
            let Some(definition) = workflow
                .resources
                .parameters
                .iter()
                .find(|item| item.id == *id)
            else {
                return Err(runtime_error(
                    ExecutionErrorKind::InvalidInputs,
                    format!("$.inputs.parameterValues.{id}"),
                    format!("找不到参数资源 '{id}'"),
                ));
            };
            if !(definition.min_value..=definition.max_value).contains(value) {
                return Err(runtime_error(
                    ExecutionErrorKind::InvalidInputs,
                    format!("$.inputs.parameterValues.{id}"),
                    format!(
                        "参数值 {value} 超出允许范围 {} 到 {}",
                        definition.min_value, definition.max_value
                    ),
                ));
            }
            parameters.insert(id.clone(), *value);
        }
        let counters = workflow
            .resources
            .counters
            .iter()
            .map(|item| (item.id.clone(), item.initial_value))
            .collect();
        Ok(Self {
            start_ms,
            points,
            detectors,
            parameters,
            counters,
            guards: workflow.safety_guards.clone(),
            executed_nodes: 0,
            loop_iterations: 0,
            events: Vec::new(),
        })
    }
}

enum ControlFlow {
    Continue,
    Finish {
        outcome: FinishOutcome,
        message: Option<String>,
    },
}

fn runtime_error(
    kind: ExecutionErrorKind,
    path: impl Into<String>,
    message: impl Into<String>,
) -> ExecutionError {
    ExecutionError {
        kind,
        path: path.into(),
        message: message.into(),
        diagnostics: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::VecDeque;

    use super::*;
    use crate::visual_workflow::model::{
        CounterResource, DetectorTemplateRef, NormalizedRegion, NumberParameter, PointLocation,
        WORKFLOW_SCHEMA_VERSION, WorkflowResources,
    };

    #[derive(Debug, Default)]
    struct FakeClock {
        now: u64,
    }

    impl WorkflowClock for FakeClock {
        fn now_ms(&self) -> u64 {
            self.now
        }

        fn sleep_ms(&mut self, duration_ms: u64) {
            self.now = self.now.saturating_add(duration_ms);
        }
    }

    #[derive(Debug, Default)]
    struct FakeInput {
        actions: Vec<String>,
    }

    impl WorkflowInput for FakeInput {
        fn click(
            &mut self,
            point: &PointResource,
            _button: MouseButton,
            click_count: u8,
        ) -> Result<(), String> {
            self.actions
                .push(format!("click:{}:{click_count}", point.id));
            Ok(())
        }

        fn key(&mut self, chord: &KeyChord) -> Result<(), String> {
            self.actions.push(format!("key:{}", chord.keys.join("+")));
            Ok(())
        }
    }

    #[derive(Debug, Default)]
    struct FakeVision {
        detector_states: HashMap<String, VecDeque<DetectorState>>,
        last_detector_states: HashMap<String, DetectorState>,
        target_states: HashMap<TargetState, TruthValue>,
    }

    impl WorkflowVision for FakeVision {
        fn detector_state(&mut self, detector: &DetectorResource) -> DetectorState {
            if let Some(value) = self
                .detector_states
                .get_mut(&detector.id)
                .and_then(VecDeque::pop_front)
            {
                self.last_detector_states.insert(detector.id.clone(), value);
                value
            } else {
                self.last_detector_states
                    .get(&detector.id)
                    .copied()
                    .unwrap_or(DetectorState::Unknown)
            }
        }

        fn target_state(&mut self, state: TargetState) -> TruthValue {
            self.target_states
                .get(&state)
                .copied()
                .unwrap_or(TruthValue::True)
        }
    }

    #[derive(Debug, Default)]
    struct FakeControl {
        events: Vec<ExecutionEvent>,
    }

    impl ExecutionControl for FakeControl {
        fn on_event(&mut self, event: &ExecutionEvent) {
            self.events.push(event.clone());
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

    fn base_workflow(root: WorkflowStep) -> WorkflowDefinition {
        WorkflowDefinition {
            schema_version: WORKFLOW_SCHEMA_VERSION,
            id: "test".into(),
            name: "测试流程".into(),
            description: None,
            target: Some(super::super::model::WorkflowTarget {
                process_name: "game.exe".into(),
                window_title: "Game".into(),
                class_name: "GameWindow".into(),
                reference_width: 1_280,
                reference_height: 720,
            }),
            resources: WorkflowResources {
                points: vec![
                    PointResource {
                        id: "record".into(),
                        name: "搜索记录".into(),
                        location: PointLocation::WindowRelative { x: 0.2, y: 0.3 },
                    },
                    PointResource {
                        id: "purchase".into(),
                        name: "购买".into(),
                        location: PointLocation::WindowRelative { x: 0.8, y: 0.8 },
                    },
                ],
                detectors: vec![DetectorResource {
                    id: "purchaseVisible".into(),
                    name: "购买图标".into(),
                    search_region: NormalizedRegion {
                        x: 0.6,
                        y: 0.6,
                        width: 0.3,
                        height: 0.3,
                    },
                    template: DetectorTemplateRef {
                        asset_id: "purchase.png".into(),
                        mask_asset_id: None,
                        width: 16,
                        height: 16,
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
                    default_value: 2,
                    min_value: 1,
                    max_value: 10,
                }],
                counters: vec![CounterResource {
                    id: "completed".into(),
                    name: "完成次数".into(),
                    initial_value: 0,
                }],
            },
            safety_guards: Vec::new(),
            root,
        }
    }

    fn run(
        workflow: &WorkflowDefinition,
        vision: &mut FakeVision,
    ) -> Result<(ExecutionReport, FakeClock, FakeInput, FakeControl), ExecutionError> {
        let mut clock = FakeClock::default();
        let mut input = FakeInput::default();
        let mut control = FakeControl::default();
        let report = Interpreter::new(&mut clock, &mut input, vision, &mut control)
            .run_with_defaults(workflow)?;
        Ok((report, clock, input, control))
    }

    #[test]
    fn unknown_detector_state_waits_without_clicking() {
        let root = step(
            "wait-purchase",
            WorkflowNode::RepeatUntil {
                condition: Condition::DetectorState {
                    detector_id: "purchaseVisible".into(),
                    state: DetectorState::Present,
                },
                body: Box::new(step(
                    "click-record",
                    WorkflowNode::Click {
                        point_id: "record".into(),
                        button: MouseButton::Left,
                        click_count: 1,
                    },
                )),
                timeout_ms: NumberExpression::Literal { value: 100 },
                poll_interval_ms: NumberExpression::Literal { value: 10 },
                max_iterations: 10,
            },
        );
        let mut vision = FakeVision::default();
        vision.detector_states.insert(
            "purchaseVisible".into(),
            [
                DetectorState::Unknown,
                DetectorState::Absent,
                DetectorState::Absent,
                DetectorState::Present,
            ]
            .into(),
        );

        let (report, clock, input, _) = run(&base_workflow(root), &mut vision).unwrap();
        assert_eq!(report.status, ExecutionStatus::Succeeded);
        assert_eq!(input.actions, ["click:record:1", "click:record:1"]);
        assert_eq!(clock.now, 10);
    }

    #[test]
    fn bounded_ast_expresses_purchase_loop_and_updates_counter() {
        let find_and_buy = step(
            "purchase-cycle",
            WorkflowNode::Sequence {
                steps: vec![
                    step(
                        "find-purchase",
                        WorkflowNode::RepeatUntil {
                            condition: Condition::DetectorState {
                                detector_id: "purchaseVisible".into(),
                                state: DetectorState::Present,
                            },
                            body: Box::new(step(
                                "click-record",
                                WorkflowNode::Click {
                                    point_id: "record".into(),
                                    button: MouseButton::Left,
                                    click_count: 1,
                                },
                            )),
                            timeout_ms: NumberExpression::Literal { value: 1_000 },
                            poll_interval_ms: NumberExpression::Literal { value: 10 },
                            max_iterations: 100,
                        },
                    ),
                    step(
                        "click-purchase",
                        WorkflowNode::Click {
                            point_id: "purchase".into(),
                            button: MouseButton::Left,
                            click_count: 1,
                        },
                    ),
                    step(
                        "increment-completed",
                        WorkflowNode::CounterAdd {
                            counter_id: "completed".into(),
                            amount: NumberExpression::Literal { value: 1 },
                        },
                    ),
                ],
            },
        );
        let workflow = base_workflow(step(
            "repeat-purchases",
            WorkflowNode::Repeat {
                count: NumberExpression::Parameter {
                    parameter_id: "purchaseCount".into(),
                },
                max_iterations: 10,
                body: Box::new(find_and_buy),
            },
        ));
        let mut vision = FakeVision::default();
        vision.detector_states.insert(
            "purchaseVisible".into(),
            [
                DetectorState::Absent,
                DetectorState::Present,
                DetectorState::Absent,
                DetectorState::Present,
            ]
            .into(),
        );

        let (report, _, input, control) = run(&workflow, &mut vision).unwrap();
        assert_eq!(report.counters["completed"], 2);
        assert_eq!(
            input.actions,
            [
                "click:record:1",
                "click:purchase:1",
                "click:record:1",
                "click:purchase:1"
            ]
        );
        assert!(control.events.iter().any(|event| {
            event.step_id.as_deref() == Some("click-purchase")
                && event.kind == ExecutionEventKind::StepStarted
        }));
    }

    #[test]
    fn wait_until_times_out_on_unknown_state() {
        let root = step(
            "wait-purchase",
            WorkflowNode::WaitUntil {
                condition: Condition::DetectorState {
                    detector_id: "purchaseVisible".into(),
                    state: DetectorState::Present,
                },
                timeout_ms: NumberExpression::Literal { value: 30 },
                poll_interval_ms: NumberExpression::Literal { value: 10 },
            },
        );
        let mut vision = FakeVision::default();
        let error = run(&base_workflow(root), &mut vision).unwrap_err();
        assert_eq!(error.kind, ExecutionErrorKind::Timeout);
    }

    #[test]
    fn safety_guard_stops_before_input() {
        let mut workflow = base_workflow(step(
            "click-record",
            WorkflowNode::Click {
                point_id: "record".into(),
                button: MouseButton::Left,
                click_count: 1,
            },
        ));
        workflow.safety_guards.push(SafetyGuard {
            condition: Condition::TargetState {
                state: TargetState::Foreground,
                expected: false,
            },
            message: "目标窗口失去前台".into(),
        });
        let mut vision = FakeVision::default();
        vision
            .target_states
            .insert(TargetState::Foreground, TruthValue::False);
        let error = run(&workflow, &mut vision).unwrap_err();
        assert_eq!(error.kind, ExecutionErrorKind::GuardTriggered);
        assert_eq!(error.path, "$.safetyGuards[0]");
    }

    #[test]
    fn unknown_safety_guard_fails_closed_before_input() {
        let mut workflow = base_workflow(step(
            "click-record",
            WorkflowNode::Click {
                point_id: "record".into(),
                button: MouseButton::Left,
                click_count: 1,
            },
        ));
        workflow.safety_guards.push(SafetyGuard {
            condition: Condition::DetectorState {
                detector_id: "purchaseVisible".into(),
                state: DetectorState::Absent,
            },
            message: "保护标志消失".into(),
        });
        let mut vision = FakeVision::default();
        let error = run(&workflow, &mut vision).unwrap_err();
        assert_eq!(error.kind, ExecutionErrorKind::IndeterminateCondition);
        assert_eq!(error.path, "$.safetyGuards[0]");
    }

    #[test]
    fn parameter_overrides_are_range_checked() {
        let workflow = base_workflow(step(
            "finish",
            WorkflowNode::Finish {
                outcome: FinishOutcome::Success,
                message: None,
            },
        ));
        let mut clock = FakeClock::default();
        let mut input = FakeInput::default();
        let mut vision = FakeVision::default();
        let mut control = FakeControl::default();
        let error = Interpreter::new(&mut clock, &mut input, &mut vision, &mut control)
            .run(
                &workflow,
                &ExecutionInputs {
                    parameter_values: [("purchaseCount".into(), 99)].into(),
                },
            )
            .unwrap_err();
        assert_eq!(error.kind, ExecutionErrorKind::InvalidInputs);
    }
}
