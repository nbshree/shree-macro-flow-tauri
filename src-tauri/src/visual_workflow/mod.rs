pub mod capture;
mod interpreter;
mod model;
pub mod platform;
pub(crate) mod runtime;
pub mod storage;
mod validate;

pub use runtime::{
    VisualWorkflow, VisualWorkflowActivity, VisualWorkflowState, capture_visual_workflow_preview,
    delete_visual_workflow_detector_template, get_visual_workflow_state,
    list_visual_workflow_capture_windows, save_visual_workflow,
    save_visual_workflow_detector_template, start_visual_workflow, stop_visual_workflow,
    validate_visual_workflow,
};

pub use interpreter::{
    ExecutionControl, ExecutionError, ExecutionErrorKind, ExecutionEvent, ExecutionEventKind,
    ExecutionInputs, ExecutionLimits, ExecutionReport, ExecutionStatus, Interpreter,
    NoopExecutionControl, WorkflowClock, WorkflowInput, WorkflowVision,
};
pub use model::{
    CompareOperator, Condition, CounterResource, DetectorResource, DetectorState,
    DetectorTemplateRef, Diagnostic, DiagnosticSeverity, FinishOutcome, KeyChord, MouseButton,
    NormalizedRegion, NumberExpression, NumberParameter, PointLocation, PointResource, SafetyGuard,
    TargetState, TruthValue, WORKFLOW_SCHEMA_VERSION, WorkflowDefinition, WorkflowNode,
    WorkflowResources, WorkflowStep, WorkflowTarget,
};
pub use validate::{
    MAX_CLICK_COUNT, MAX_KEY_CHORD_KEYS, MAX_KEY_HOLD_MS, MAX_LOOP_ITERATIONS, MAX_WORKFLOW_DEPTH,
    MAX_WORKFLOW_NODES, has_errors, validate_workflow,
};
