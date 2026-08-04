import {
  ArrowDown,
  ArrowUp,
  Braces,
  Clock3,
  Flag,
  GitBranch,
  Keyboard,
  ListTree,
  MessageSquareText,
  MousePointerClick,
  Plus,
  Repeat2,
  ShieldCheck,
  Trash2
} from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { Button } from '../../components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select'
import {
  describeVisualWorkflowStep,
  type VisualWorkflowController,
  type VisualWorkflowStepType
} from '../../hooks/useVisualWorkflowController'
import type { VisualWorkflowStep } from '../../lib/macro-api'

const addableStepTypes: Array<{ value: VisualWorkflowStepType; label: string }> = [
  { value: 'click', label: '点击点位' },
  { value: 'key', label: '发送按键' },
  { value: 'delay', label: '固定等待' },
  { value: 'waitUntil', label: '等待条件' },
  { value: 'if', label: '如果 / 否则' },
  { value: 'repeat', label: '重复固定次数' },
  { value: 'repeatUntil', label: '重复直到' },
  { value: 'counterAdd', label: '增加计数器' },
  { value: 'assert', label: '校验条件' },
  { value: 'log', label: '写入日志' },
  { value: 'finish', label: '结束流程' },
  { value: 'sequence', label: '步骤组' }
]

export function VisualWorkflowTree({
  controller
}: {
  controller: VisualWorkflowController
}): React.JSX.Element {
  const [stepType, setStepType] = useState<VisualWorkflowStepType>('click')
  const root = controller.draft.root
  const stepCount = countSteps(root) - 1

  return (
    <section className="ui-panel visual-workflow-tree-panel" aria-labelledby="workflow-tree-title">
      <header className="visual-workflow-section-heading">
        <div>
          <h2 id="workflow-tree-title">
            <ListTree aria-hidden="true" />
            流程步骤
          </h2>
          <p>{stepCount} 个可执行步骤，按从上到下的顺序运行</p>
        </div>
        <span className="visual-workflow-section-count">{stepCount}</span>
      </header>

      <div className="visual-workflow-add-step" aria-label="添加流程步骤">
        <Select
          disabled={controller.isLocked}
          value={stepType}
          onValueChange={(value) => setStepType(value as VisualWorkflowStepType)}
        >
          <SelectTrigger aria-label="新步骤类型" size="compact">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {addableStepTypes.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          disabled={controller.isLocked}
          size="compact"
          type="button"
          onClick={() => controller.addStep(stepType)}
        >
          <Plus aria-hidden="true" />
          添加步骤
        </Button>
      </div>
      <p className="visual-workflow-add-hint">
        添加到当前步骤之后；选中步骤组时会添加到组内。也可使用上下按钮精确排序。
      </p>

      <div className="visual-workflow-tree" role="tree" aria-label="视觉流程步骤树">
        <WorkflowTreeItem controller={controller} depth={1} root step={root} />
      </div>
    </section>
  )
}

function WorkflowTreeItem({
  controller,
  depth,
  root = false,
  step
}: {
  controller: VisualWorkflowController
  depth: number
  root?: boolean
  step: VisualWorkflowStep
}): React.JSX.Element {
  const selected = controller.selection.kind === 'step' && controller.selection.id === step.id
  const current = controller.state.currentStepId === step.id
  const expanded = hasNestedSteps(step)

  return (
    <div
      aria-expanded={expanded ? true : undefined}
      aria-level={depth}
      aria-selected={selected}
      className="visual-workflow-tree-item"
      data-current={String(current)}
      data-disabled={String(!step.enabled)}
      data-selected={String(selected)}
      role="treeitem"
    >
      <div className="visual-workflow-step-row">
        <button
          className="visual-workflow-step-select"
          type="button"
          onClick={() => controller.setSelection({ kind: 'step', id: step.id })}
        >
          <span className="visual-workflow-step-icon">{stepIcon(step.type)}</span>
          <span className="visual-workflow-step-copy">
            <span className="visual-workflow-step-topline">
              <strong>{step.label?.trim() || stepTypeLabel(step.type)}</strong>
              {!step.enabled ? <span>已停用</span> : null}
              {current ? <span>正在执行</span> : null}
            </span>
            <small>{describeVisualWorkflowStep(step, controller.draft)}</small>
          </span>
        </button>

        {!root ? (
          <div className="visual-workflow-step-actions">
            <Button
              aria-label={`上移步骤 ${step.label || stepTypeLabel(step.type)}`}
              disabled={controller.isLocked || !controller.canMoveStep(step.id, 'up')}
              size="icon-compact"
              title="上移步骤"
              type="button"
              variant="ghost"
              onClick={() => controller.moveStep(step.id, 'up')}
            >
              <ArrowUp aria-hidden="true" />
            </Button>
            <Button
              aria-label={`下移步骤 ${step.label || stepTypeLabel(step.type)}`}
              disabled={controller.isLocked || !controller.canMoveStep(step.id, 'down')}
              size="icon-compact"
              title="下移步骤"
              type="button"
              variant="ghost"
              onClick={() => controller.moveStep(step.id, 'down')}
            >
              <ArrowDown aria-hidden="true" />
            </Button>
            <Button
              aria-label={`删除步骤 ${step.label || stepTypeLabel(step.type)}`}
              disabled={controller.isLocked}
              size="icon-compact"
              title="删除步骤"
              type="button"
              variant="ghost"
              onClick={() => {
                const label = step.label || stepTypeLabel(step.type)
                if (window.confirm(`确定删除步骤“${label}”吗？`)) {
                  controller.removeStep(step.id)
                }
              }}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </div>

      {step.type === 'sequence' && step.steps.length > 0 ? (
        <NestedSteps>
          {step.steps.map((child) => (
            <WorkflowTreeItem
              controller={controller}
              depth={depth + 1}
              key={child.id}
              step={child}
            />
          ))}
        </NestedSteps>
      ) : null}

      {step.type === 'if' ? (
        <NestedSteps>
          <Branch label="满足时">
            <WorkflowTreeItem controller={controller} depth={depth + 1} step={step.thenBranch} />
          </Branch>
          {step.elseBranch ? (
            <Branch label="否则">
              <WorkflowTreeItem controller={controller} depth={depth + 1} step={step.elseBranch} />
            </Branch>
          ) : null}
        </NestedSteps>
      ) : null}

      {step.type === 'repeat' || step.type === 'repeatUntil' ? (
        <NestedSteps>
          <Branch label="循环体">
            <WorkflowTreeItem controller={controller} depth={depth + 1} step={step.body} />
          </Branch>
        </NestedSteps>
      ) : null}
    </div>
  )
}

function NestedSteps({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <div className="visual-workflow-tree-children" role="group">
      {children}
    </div>
  )
}

function Branch({ children, label }: { children: ReactNode; label: string }): React.JSX.Element {
  return (
    <div className="visual-workflow-branch">
      <span className="visual-workflow-branch-label">{label}</span>
      {children}
    </div>
  )
}

function hasNestedSteps(step: VisualWorkflowStep): boolean {
  return (
    (step.type === 'sequence' && step.steps.length > 0) ||
    step.type === 'if' ||
    step.type === 'repeat' ||
    step.type === 'repeatUntil'
  )
}

function countSteps(step: VisualWorkflowStep): number {
  switch (step.type) {
    case 'sequence':
      return 1 + step.steps.reduce((total, child) => total + countSteps(child), 0)
    case 'if':
      return 1 + countSteps(step.thenBranch) + (step.elseBranch ? countSteps(step.elseBranch) : 0)
    case 'repeat':
    case 'repeatUntil':
      return 1 + countSteps(step.body)
    default:
      return 1
  }
}

export function stepTypeLabel(type: VisualWorkflowStepType): string {
  return (
    {
      sequence: '步骤组',
      click: '点击点位',
      key: '发送按键',
      delay: '固定等待',
      if: '条件判断',
      repeat: '重复固定次数',
      repeatUntil: '重复直到',
      waitUntil: '等待条件',
      counterAdd: '增加计数器',
      assert: '校验条件',
      log: '写入日志',
      finish: '结束流程'
    } satisfies Record<VisualWorkflowStepType, string>
  )[type]
}

function stepIcon(type: VisualWorkflowStepType): React.JSX.Element {
  switch (type) {
    case 'sequence':
      return <ListTree aria-hidden="true" />
    case 'click':
      return <MousePointerClick aria-hidden="true" />
    case 'key':
      return <Keyboard aria-hidden="true" />
    case 'delay':
    case 'waitUntil':
      return <Clock3 aria-hidden="true" />
    case 'if':
      return <GitBranch aria-hidden="true" />
    case 'repeat':
    case 'repeatUntil':
      return <Repeat2 aria-hidden="true" />
    case 'counterAdd':
      return <Braces aria-hidden="true" />
    case 'assert':
      return <ShieldCheck aria-hidden="true" />
    case 'log':
      return <MessageSquareText aria-hidden="true" />
    case 'finish':
      return <Flag aria-hidden="true" />
  }
}
