import { CircleAlert, Crosshair, Eye, ListTree, Plus, Settings2, Trash2 } from 'lucide-react'
import { useId } from 'react'

import { Alert, AlertDescription } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select'
import { Switch } from '../../components/ui/switch'
import {
  defaultCondition,
  type VisualWorkflowController
} from '../../hooks/useVisualWorkflowController'
import type {
  VisualWorkflowCondition,
  VisualWorkflowDetectorResource,
  VisualWorkflowNumberExpression,
  VisualWorkflowPointResource,
  VisualWorkflowStep
} from '../../lib/macro-api'
import { stepTypeLabel } from './VisualWorkflowTree'

const I32_MIN = -2_147_483_648
const I32_MAX = 2_147_483_647
const MAX_WORKFLOW_LOOP_ITERATIONS = 1_000_000

export function VisualWorkflowInspector({
  controller
}: {
  controller: VisualWorkflowController
}): React.JSX.Element {
  const { selection } = controller

  if (selection.kind === 'point') {
    const point = controller.draft.resources.points.find((item) => item.id === selection.id)
    return point ? <PointInspector controller={controller} point={point} /> : <EmptyInspector />
  }

  if (selection.kind === 'detector') {
    const detector = controller.draft.resources.detectors.find((item) => item.id === selection.id)
    return detector ? (
      <DetectorInspector controller={controller} detector={detector} />
    ) : (
      <EmptyInspector />
    )
  }

  return controller.selectedStep ? (
    <StepInspector controller={controller} step={controller.selectedStep} />
  ) : (
    <EmptyInspector />
  )
}

function InspectorPanel({
  children,
  icon,
  subtitle,
  title
}: {
  children: React.ReactNode
  icon: React.ReactNode
  subtitle: string
  title: string
}): React.JSX.Element {
  return (
    <section
      className="ui-panel visual-workflow-inspector"
      aria-labelledby="workflow-inspector-title"
    >
      <header className="visual-workflow-section-heading">
        <div>
          <h2 id="workflow-inspector-title">
            {icon}
            {title}
          </h2>
          <p>{subtitle}</p>
        </div>
      </header>
      <div className="visual-workflow-inspector-body">{children}</div>
    </section>
  )
}

function EmptyInspector(): React.JSX.Element {
  return (
    <InspectorPanel
      icon={<Settings2 aria-hidden="true" />}
      subtitle="从左侧资源库或中间步骤树选择一项"
      title="属性"
    >
      <div className="visual-workflow-inspector-empty">
        <Settings2 aria-hidden="true" />
        <strong>尚未选择可编辑项</strong>
        <span>选择点位、识别器或流程步骤后，可在这里调整详细参数。</span>
      </div>
    </InspectorPanel>
  )
}

function PointInspector({
  controller,
  point
}: {
  controller: VisualWorkflowController
  point: VisualWorkflowPointResource
}): React.JSX.Element {
  const relative = point.location.mode === 'windowRelative'
  return (
    <InspectorPanel
      icon={<Crosshair aria-hidden="true" />}
      subtitle="推荐使用窗口相对坐标，移动窗口后仍可换算"
      title="点位属性"
    >
      <Field label="点位名称" htmlFor="workflow-point-name">
        <Input
          disabled={controller.isLocked}
          id="workflow-point-name"
          maxLength={64}
          value={point.name}
          onChange={(event) => controller.updatePoint(point.id, { name: event.target.value })}
        />
      </Field>

      <Field label="坐标模式" htmlFor="workflow-point-mode">
        <Select
          disabled={controller.isLocked}
          value={point.location.mode}
          onValueChange={(mode) => {
            controller.updatePoint(point.id, {
              location:
                mode === 'screenPhysical'
                  ? { mode, x: 0, y: 0 }
                  : { mode: 'windowRelative', x: 0.5, y: 0.5 }
            })
          }}
        >
          <SelectTrigger id="workflow-point-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="windowRelative">窗口相对坐标</SelectItem>
            <SelectItem value="screenPhysical">物理屏幕坐标</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <div className="visual-workflow-field-grid">
        <NumberField
          disabled={controller.isLocked}
          label={relative ? 'X（0–1）' : 'X（像素）'}
          max={relative ? 1 : I32_MAX}
          min={relative ? 0 : I32_MIN}
          step={relative ? 0.001 : 1}
          value={point.location.x}
          onChange={(x) => controller.updatePoint(point.id, { location: { ...point.location, x } })}
        />
        <NumberField
          disabled={controller.isLocked}
          label={relative ? 'Y（0–1）' : 'Y（像素）'}
          max={relative ? 1 : I32_MAX}
          min={relative ? 0 : I32_MIN}
          step={relative ? 0.001 : 1}
          value={point.location.y}
          onChange={(y) => controller.updatePoint(point.id, { location: { ...point.location, y } })}
        />
      </div>

      <Button
        className="visual-workflow-delete-resource"
        disabled={controller.isLocked}
        type="button"
        variant="destructive"
        onClick={() => {
          if (window.confirm(`确定删除点位“${point.name}”吗？引用它的步骤将无法通过校验。`)) {
            controller.removePoint(point.id)
          }
        }}
      >
        <Trash2 aria-hidden="true" />
        删除点位
      </Button>
    </InspectorPanel>
  )
}

function DetectorInspector({
  controller,
  detector
}: {
  controller: VisualWorkflowController
  detector: VisualWorkflowDetectorResource
}): React.JSX.Element {
  const updateRegion = (patch: Partial<VisualWorkflowDetectorResource['searchRegion']>) => {
    controller.updateDetector(detector.id, {
      searchRegion: { ...detector.searchRegion, ...patch }
    })
  }

  return (
    <InspectorPanel
      icon={<Eye aria-hidden="true" />}
      subtitle="搜索区域使用目标窗口内的 0–1 归一化矩形"
      title="识别器属性"
    >
      <Field label="识别器名称" htmlFor="workflow-detector-name">
        <Input
          disabled={controller.isLocked}
          id="workflow-detector-name"
          maxLength={64}
          value={detector.name}
          onChange={(event) => controller.updateDetector(detector.id, { name: event.target.value })}
        />
      </Field>

      <div className="visual-workflow-template-status">
        <div>
          <span>识别模板</span>
          <strong>{detector.template.assetId || '尚未采集'}</strong>
        </div>
        <Badge variant={detector.template.assetId ? 'outline' : 'destructive'}>
          {detector.template.assetId
            ? `${detector.template.width} × ${detector.template.height}`
            : '待配置'}
        </Badge>
      </div>

      {!detector.template.assetId ? (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>
            识别模板尚未采集。请在左侧“窗口预览与采集”中截图、框选搜索区域并采集模板。
          </AlertDescription>
        </Alert>
      ) : null}

      <fieldset className="visual-workflow-fieldset">
        <legend>搜索区域</legend>
        <div className="visual-workflow-field-grid visual-workflow-field-grid--four">
          <NumberField
            disabled={controller.isLocked}
            label="X"
            max={1}
            min={0}
            step={0.001}
            value={detector.searchRegion.x}
            onChange={(x) => updateRegion({ x })}
          />
          <NumberField
            disabled={controller.isLocked}
            label="Y"
            max={1}
            min={0}
            step={0.001}
            value={detector.searchRegion.y}
            onChange={(y) => updateRegion({ y })}
          />
          <NumberField
            disabled={controller.isLocked}
            label="宽"
            max={1}
            min={0.001}
            step={0.001}
            value={detector.searchRegion.width}
            onChange={(width) => updateRegion({ width })}
          />
          <NumberField
            disabled={controller.isLocked}
            label="高"
            max={1}
            min={0.001}
            step={0.001}
            value={detector.searchRegion.height}
            onChange={(height) => updateRegion({ height })}
          />
        </div>
      </fieldset>

      <div className="visual-workflow-field-grid">
        <NumberField
          disabled={controller.isLocked}
          label="匹配阈值"
          max={1}
          min={0.01}
          step={0.01}
          value={detector.matchThreshold}
          onChange={(matchThreshold) => controller.updateDetector(detector.id, { matchThreshold })}
        />
        <NumberField
          disabled={controller.isLocked}
          label="结果过期 ms"
          min={166}
          step={1}
          value={detector.staleAfterMs}
          onChange={(staleAfterMs) => controller.updateDetector(detector.id, { staleAfterMs })}
        />
        <NumberField
          disabled={controller.isLocked}
          label="确认帧数"
          max={120}
          min={1}
          step={1}
          value={detector.confirmFrames}
          onChange={(confirmFrames) => controller.updateDetector(detector.id, { confirmFrames })}
        />
        <NumberField
          disabled={controller.isLocked}
          label="缺失帧数"
          max={120}
          min={1}
          step={1}
          value={detector.missingFrames}
          onChange={(missingFrames) => controller.updateDetector(detector.id, { missingFrames })}
        />
      </div>

      <Button
        className="visual-workflow-delete-resource"
        disabled={controller.isLocked}
        type="button"
        variant="destructive"
        onClick={() => {
          if (window.confirm(`确定删除识别器“${detector.name}”吗？引用它的条件将无法通过校验。`)) {
            controller.removeDetector(detector.id)
          }
        }}
      >
        <Trash2 aria-hidden="true" />
        删除识别器
      </Button>
    </InspectorPanel>
  )
}

function StepInspector({
  controller,
  step
}: {
  controller: VisualWorkflowController
  step: VisualWorkflowStep
}): React.JSX.Element {
  const root = step.id === controller.draft.root.id

  return (
    <InspectorPanel
      icon={<ListTree aria-hidden="true" />}
      subtitle="运行中会冻结流程定义，停止后才能继续编辑"
      title="步骤属性"
    >
      <div className="visual-workflow-inspector-kind">
        <Badge variant="outline">{stepTypeLabel(step.type)}</Badge>
        <code>{step.id}</code>
      </div>

      <Field label="步骤名称" htmlFor="workflow-step-label">
        <Input
          disabled={controller.isLocked}
          id="workflow-step-label"
          maxLength={64}
          value={step.label ?? ''}
          onChange={(event) =>
            controller.updateStep(step.id, (current) => ({
              ...current,
              label: event.target.value
            }))
          }
        />
      </Field>

      <div className="visual-workflow-switch-field">
        <div>
          <Label htmlFor="workflow-step-enabled">启用步骤</Label>
          <p>停用后保留配置，但运行时会跳过该步骤和它的子步骤。</p>
        </div>
        <Switch
          checked={step.enabled}
          disabled={controller.isLocked || root}
          id="workflow-step-enabled"
          onCheckedChange={(enabled) =>
            controller.updateStep(step.id, (current) => ({ ...current, enabled }))
          }
        />
      </div>

      <StepSpecificFields controller={controller} step={step} />
    </InspectorPanel>
  )
}

function StepSpecificFields({
  controller,
  step
}: {
  controller: VisualWorkflowController
  step: VisualWorkflowStep
}): React.JSX.Element {
  switch (step.type) {
    case 'sequence':
      return (
        <div className="visual-workflow-readonly-note">
          该步骤组包含 {step.steps.length} 个直接子步骤。选中它后添加的新步骤会进入组内。
        </div>
      )
    case 'click':
      return <ClickFields controller={controller} step={step} />
    case 'key':
      return <KeyFields controller={controller} step={step} />
    case 'delay':
      return (
        <ExpressionField
          controller={controller}
          disabled={controller.isLocked}
          expression={step.durationMs}
          label="等待时长 ms"
          min={0}
          onChange={(durationMs) =>
            controller.updateStep(step.id, (current) =>
              current.type === 'delay' ? { ...current, durationMs } : current
            )
          }
        />
      )
    case 'if':
      return (
        <VisualWorkflowConditionEditor
          condition={step.condition}
          controller={controller}
          onChange={(condition) => updateStepCondition(controller, step.id, condition)}
        />
      )
    case 'repeat':
      return (
        <>
          <ExpressionField
            controller={controller}
            disabled={controller.isLocked}
            expression={step.count}
            label="重复次数"
            min={1}
            onChange={(count) =>
              controller.updateStep(step.id, (current) =>
                current.type === 'repeat' ? { ...current, count } : current
              )
            }
          />
          <NumberField
            disabled={controller.isLocked}
            label="安全次数上限"
            max={MAX_WORKFLOW_LOOP_ITERATIONS}
            min={1}
            step={1}
            value={step.maxIterations}
            onChange={(maxIterations) =>
              controller.updateStep(step.id, (current) =>
                current.type === 'repeat' ? { ...current, maxIterations } : current
              )
            }
          />
        </>
      )
    case 'repeatUntil':
      return (
        <>
          <VisualWorkflowConditionEditor
            condition={step.condition}
            controller={controller}
            onChange={(condition) => updateStepCondition(controller, step.id, condition)}
          />
          <LoopTimingFields controller={controller} step={step} />
        </>
      )
    case 'waitUntil':
      return (
        <>
          <VisualWorkflowConditionEditor
            condition={step.condition}
            controller={controller}
            onChange={(condition) => updateStepCondition(controller, step.id, condition)}
          />
          <LoopTimingFields controller={controller} step={step} />
        </>
      )
    case 'counterAdd':
      return (
        <>
          <Field label="计数器" htmlFor="workflow-counter-add-target">
            <Select
              disabled={controller.isLocked}
              value={step.counterId || '__none__'}
              onValueChange={(counterId) =>
                controller.updateStep(step.id, (current) =>
                  current.type === 'counterAdd'
                    ? { ...current, counterId: counterId === '__none__' ? '' : counterId }
                    : current
                )
              }
            >
              <SelectTrigger id="workflow-counter-add-target">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {controller.draft.resources.counters.length === 0 ? (
                  <SelectItem value="__none__">未配置计数器</SelectItem>
                ) : null}
                {controller.draft.resources.counters.map((counter) => (
                  <SelectItem key={counter.id} value={counter.id}>
                    {counter.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <ExpressionField
            controller={controller}
            disabled={controller.isLocked}
            expression={step.amount}
            label="增加数值"
            min={Number.MIN_SAFE_INTEGER}
            onChange={(amount) =>
              controller.updateStep(step.id, (current) =>
                current.type === 'counterAdd' ? { ...current, amount } : current
              )
            }
          />
        </>
      )
    case 'assert':
      return (
        <>
          <VisualWorkflowConditionEditor
            condition={step.condition}
            controller={controller}
            onChange={(condition) => updateStepCondition(controller, step.id, condition)}
          />
          <Field label="失败提示" htmlFor="workflow-assert-message">
            <Input
              disabled={controller.isLocked}
              id="workflow-assert-message"
              value={step.message}
              onChange={(event) =>
                controller.updateStep(step.id, (current) =>
                  current.type === 'assert' ? { ...current, message: event.target.value } : current
                )
              }
            />
          </Field>
        </>
      )
    case 'log':
      return (
        <Field label="日志内容" htmlFor="workflow-log-message">
          <Input
            disabled={controller.isLocked}
            id="workflow-log-message"
            value={step.message}
            onChange={(event) =>
              controller.updateStep(step.id, (current) =>
                current.type === 'log' ? { ...current, message: event.target.value } : current
              )
            }
          />
        </Field>
      )
    case 'finish':
      return <FinishFields controller={controller} step={step} />
  }
}

function ClickFields({
  controller,
  step
}: {
  controller: VisualWorkflowController
  step: Extract<VisualWorkflowStep, { type: 'click' }>
}): React.JSX.Element {
  const pointValue = step.pointId || '__none__'
  return (
    <>
      <Field label="点击点位" htmlFor="workflow-click-point">
        <Select
          disabled={controller.isLocked}
          value={pointValue}
          onValueChange={(pointId) =>
            controller.updateStep(step.id, (current) =>
              current.type === 'click'
                ? { ...current, pointId: pointId === '__none__' ? '' : pointId }
                : current
            )
          }
        >
          <SelectTrigger id="workflow-click-point">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {controller.draft.resources.points.length === 0 ? (
              <SelectItem value="__none__">未配置点位</SelectItem>
            ) : null}
            {controller.draft.resources.points.map((point) => (
              <SelectItem key={point.id} value={point.id}>
                {point.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="visual-workflow-field-grid">
        <Field label="鼠标按键" htmlFor="workflow-click-button">
          <Select
            disabled={controller.isLocked}
            value={step.button}
            onValueChange={(button) =>
              controller.updateStep(step.id, (current) =>
                current.type === 'click' &&
                (button === 'left' || button === 'right' || button === 'middle')
                  ? { ...current, button }
                  : current
              )
            }
          >
            <SelectTrigger id="workflow-click-button">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left">左键</SelectItem>
              <SelectItem value="right">右键</SelectItem>
              <SelectItem value="middle">中键</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <NumberField
          disabled={controller.isLocked}
          label="点击次数"
          max={3}
          min={1}
          step={1}
          value={step.clickCount}
          onChange={(clickCount) =>
            controller.updateStep(step.id, (current) =>
              current.type === 'click' ? { ...current, clickCount } : current
            )
          }
        />
      </div>
    </>
  )
}

function KeyFields({
  controller,
  step
}: {
  controller: VisualWorkflowController
  step: Extract<VisualWorkflowStep, { type: 'key' }>
}): React.JSX.Element {
  return (
    <>
      <Field label="按键组合" htmlFor="workflow-key-chord">
        <Input
          disabled={controller.isLocked}
          id="workflow-key-chord"
          value={step.chord.keys.join(' + ')}
          onChange={(event) => {
            const keys = event.target.value
              .split('+')
              .map((key) => key.trim())
              .filter(Boolean)
            controller.updateStep(step.id, (current) =>
              current.type === 'key' ? { ...current, chord: { ...current.chord, keys } } : current
            )
          }}
        />
      </Field>
      <NumberField
        disabled={controller.isLocked}
        label="按住时长 ms"
        max={60_000}
        min={0}
        step={1}
        value={step.chord.holdMs}
        onChange={(holdMs) =>
          controller.updateStep(step.id, (current) =>
            current.type === 'key' ? { ...current, chord: { ...current.chord, holdMs } } : current
          )
        }
      />
    </>
  )
}

function LoopTimingFields({
  controller,
  step
}: {
  controller: VisualWorkflowController
  step: Extract<VisualWorkflowStep, { type: 'repeatUntil' | 'waitUntil' }>
}): React.JSX.Element {
  return (
    <div className="visual-workflow-field-grid">
      <ExpressionField
        controller={controller}
        disabled={controller.isLocked}
        expression={step.timeoutMs}
        label="超时 ms"
        min={1}
        onChange={(timeoutMs) =>
          controller.updateStep(step.id, (current) =>
            current.type === 'repeatUntil' || current.type === 'waitUntil'
              ? { ...current, timeoutMs }
              : current
          )
        }
      />
      <ExpressionField
        controller={controller}
        disabled={controller.isLocked}
        expression={step.pollIntervalMs}
        label="检查间隔 ms"
        min={1}
        onChange={(pollIntervalMs) =>
          controller.updateStep(step.id, (current) =>
            current.type === 'repeatUntil' || current.type === 'waitUntil'
              ? { ...current, pollIntervalMs }
              : current
          )
        }
      />
      {step.type === 'repeatUntil' ? (
        <NumberField
          disabled={controller.isLocked}
          label="安全次数上限"
          max={MAX_WORKFLOW_LOOP_ITERATIONS}
          min={1}
          step={1}
          value={step.maxIterations}
          onChange={(maxIterations) =>
            controller.updateStep(step.id, (current) =>
              current.type === 'repeatUntil' ? { ...current, maxIterations } : current
            )
          }
        />
      ) : null}
    </div>
  )
}

function FinishFields({
  controller,
  step
}: {
  controller: VisualWorkflowController
  step: Extract<VisualWorkflowStep, { type: 'finish' }>
}): React.JSX.Element {
  return (
    <>
      <Field label="结束结果" htmlFor="workflow-finish-outcome">
        <Select
          disabled={controller.isLocked}
          value={step.outcome}
          onValueChange={(outcome) =>
            controller.updateStep(step.id, (current) =>
              current.type === 'finish' && (outcome === 'success' || outcome === 'failure')
                ? { ...current, outcome }
                : current
            )
          }
        >
          <SelectTrigger id="workflow-finish-outcome">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="success">正常完成</SelectItem>
            <SelectItem value="failure">异常停止</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="结束说明" htmlFor="workflow-finish-message">
        <Input
          disabled={controller.isLocked}
          id="workflow-finish-message"
          value={step.message ?? ''}
          onChange={(event) =>
            controller.updateStep(step.id, (current) =>
              current.type === 'finish'
                ? { ...current, message: event.target.value || undefined }
                : current
            )
          }
        />
      </Field>
    </>
  )
}

export function VisualWorkflowConditionEditor({
  condition,
  controller,
  legend = '执行条件',
  onChange
}: {
  condition: VisualWorkflowCondition
  controller: VisualWorkflowController
  legend?: string
  onChange: (condition: VisualWorkflowCondition) => void
}): React.JSX.Element {
  const generatedId = useId().replace(/:/g, '')
  const firstDetector = controller.draft.resources.detectors[0]
  const firstCounter = controller.draft.resources.counters[0]

  return (
    <fieldset className="visual-workflow-fieldset">
      <legend>{legend}</legend>
      <Field label="条件类型" htmlFor={`workflow-condition-type-${generatedId}`}>
        <Select
          disabled={controller.isLocked}
          value={condition.type}
          onValueChange={(type) => {
            if (type === 'detectorState') {
              onChange({
                type,
                detectorId: firstDetector?.id ?? '',
                state: 'present'
              })
            } else if (type === 'targetState') {
              onChange({ type, state: 'foreground', expected: true })
            } else if (type === 'counterCompare') {
              onChange({
                type,
                counterId: firstCounter?.id ?? '',
                operator: 'equal',
                value: { type: 'literal', value: 0 }
              })
            } else if (type === 'all' || type === 'any') {
              onChange({ type, conditions: [defaultCondition(controller.draft)] })
            } else if (type === 'not') {
              onChange({ type, condition: defaultCondition(controller.draft) })
            }
          }}
        >
          <SelectTrigger id={`workflow-condition-type-${generatedId}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="detectorState">识别图片状态</SelectItem>
            <SelectItem value="counterCompare">计数器比较</SelectItem>
            <SelectItem value="targetState">目标窗口状态</SelectItem>
            <SelectItem value="all">全部满足（并且）</SelectItem>
            <SelectItem value="any">任一满足（或者）</SelectItem>
            <SelectItem value="not">条件取反</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {condition.type === 'detectorState' ? (
        <div className="visual-workflow-field-grid">
          <Field label="识别器" htmlFor={`workflow-condition-detector-${generatedId}`}>
            <Select
              disabled={controller.isLocked}
              value={condition.detectorId || '__none__'}
              onValueChange={(detectorId) =>
                onChange({
                  ...condition,
                  detectorId: detectorId === '__none__' ? '' : detectorId
                })
              }
            >
              <SelectTrigger id={`workflow-condition-detector-${generatedId}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {controller.draft.resources.detectors.length === 0 ? (
                  <SelectItem value="__none__">未配置识别器</SelectItem>
                ) : null}
                {controller.draft.resources.detectors.map((detector) => (
                  <SelectItem key={detector.id} value={detector.id}>
                    {detector.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="期望状态" htmlFor={`workflow-condition-state-${generatedId}`}>
            <Select
              disabled={controller.isLocked}
              value={condition.state}
              onValueChange={(state) => {
                if (state === 'present' || state === 'absent') {
                  onChange({ ...condition, state })
                }
              }}
            >
              <SelectTrigger id={`workflow-condition-state-${generatedId}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="present">出现</SelectItem>
                <SelectItem value="absent">消失</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : null}

      {condition.type === 'counterCompare' ? (
        <>
          <div className="visual-workflow-field-grid">
            <Field label="计数器" htmlFor={`workflow-condition-counter-${generatedId}`}>
              <Select
                disabled={controller.isLocked}
                value={condition.counterId || '__none__'}
                onValueChange={(counterId) =>
                  onChange({
                    ...condition,
                    counterId: counterId === '__none__' ? '' : counterId
                  })
                }
              >
                <SelectTrigger id={`workflow-condition-counter-${generatedId}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {controller.draft.resources.counters.length === 0 ? (
                    <SelectItem value="__none__">未配置计数器</SelectItem>
                  ) : null}
                  {controller.draft.resources.counters.map((counter) => (
                    <SelectItem key={counter.id} value={counter.id}>
                      {counter.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="比较方式" htmlFor={`workflow-condition-operator-${generatedId}`}>
              <Select
                disabled={controller.isLocked}
                value={condition.operator}
                onValueChange={(operator) =>
                  onChange({
                    ...condition,
                    operator: operator as Extract<
                      VisualWorkflowCondition,
                      { type: 'counterCompare' }
                    >['operator']
                  })
                }
              >
                <SelectTrigger id={`workflow-condition-operator-${generatedId}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equal">等于</SelectItem>
                  <SelectItem value="notEqual">不等于</SelectItem>
                  <SelectItem value="lessThan">小于</SelectItem>
                  <SelectItem value="lessThanOrEqual">小于等于</SelectItem>
                  <SelectItem value="greaterThan">大于</SelectItem>
                  <SelectItem value="greaterThanOrEqual">大于等于</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <ExpressionField
            controller={controller}
            disabled={controller.isLocked}
            expression={condition.value}
            label="比较值"
            min={Number.MIN_SAFE_INTEGER}
            onChange={(value) => onChange({ ...condition, value })}
          />
        </>
      ) : null}

      {condition.type === 'targetState' ? (
        <>
          <Field label="窗口状态" htmlFor={`workflow-condition-target-${generatedId}`}>
            <Select
              disabled={controller.isLocked}
              value={condition.state}
              onValueChange={(state) => {
                if (state === 'exists' || state === 'foreground' || state === 'capturable') {
                  onChange({ ...condition, state })
                }
              }}
            >
              <SelectTrigger id={`workflow-condition-target-${generatedId}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exists">目标窗口存在</SelectItem>
                <SelectItem value="foreground">目标窗口位于前台</SelectItem>
                <SelectItem value="capturable">目标窗口可截图</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="visual-workflow-switch-field">
            <div>
              <Label htmlFor={`workflow-condition-expected-${generatedId}`}>条件应成立</Label>
              <p>关闭后表示等待该窗口状态不成立。</p>
            </div>
            <Switch
              checked={condition.expected}
              disabled={controller.isLocked}
              id={`workflow-condition-expected-${generatedId}`}
              onCheckedChange={(expected) => onChange({ ...condition, expected })}
            />
          </div>
        </>
      ) : null}

      {condition.type === 'all' || condition.type === 'any' ? (
        <div className="visual-workflow-condition-list">
          {condition.conditions.map((child, index) => (
            <div className="visual-workflow-condition-child" key={`${generatedId}-${index}`}>
              <VisualWorkflowConditionEditor
                condition={child}
                controller={controller}
                legend={`子条件 ${index + 1}`}
                onChange={(next) =>
                  onChange({
                    ...condition,
                    conditions: condition.conditions.map((item, childIndex) =>
                      childIndex === index ? next : item
                    )
                  })
                }
              />
              <Button
                aria-label={`删除子条件 ${index + 1}`}
                disabled={controller.isLocked}
                size="icon-compact"
                type="button"
                variant="ghost"
                onClick={() =>
                  onChange({
                    ...condition,
                    conditions: condition.conditions.filter((_, childIndex) => childIndex !== index)
                  })
                }
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          ))}
          <Button
            disabled={controller.isLocked}
            type="button"
            variant="outline"
            onClick={() =>
              onChange({
                ...condition,
                conditions: [...condition.conditions, defaultCondition(controller.draft)]
              })
            }
          >
            <Plus aria-hidden="true" />
            添加子条件
          </Button>
        </div>
      ) : null}

      {condition.type === 'not' ? (
        <VisualWorkflowConditionEditor
          condition={condition.condition}
          controller={controller}
          legend="需要取反的条件"
          onChange={(next) => onChange({ ...condition, condition: next })}
        />
      ) : null}
    </fieldset>
  )
}

function updateStepCondition(
  controller: VisualWorkflowController,
  stepId: string,
  condition: VisualWorkflowCondition
): void {
  controller.updateStep(stepId, (current) => {
    if (
      current.type === 'if' ||
      current.type === 'repeatUntil' ||
      current.type === 'waitUntil' ||
      current.type === 'assert'
    ) {
      return { ...current, condition }
    }
    return current
  })
}

function ExpressionField({
  controller,
  disabled,
  expression,
  label,
  min,
  onChange
}: {
  controller: VisualWorkflowController
  disabled: boolean
  expression: VisualWorkflowNumberExpression
  label: string
  min: number
  onChange: (expression: VisualWorkflowNumberExpression) => void
}): React.JSX.Element {
  const generatedId = useId().replace(/:/g, '')

  return (
    <fieldset className="visual-workflow-fieldset visual-workflow-expression-field">
      <legend>{label}</legend>
      <Field label="数值来源" htmlFor={`workflow-expression-kind-${generatedId}`}>
        <Select
          disabled={disabled}
          value={expression.type}
          onValueChange={(type) => {
            if (type === 'literal') {
              onChange({ type, value: Math.max(min, 0) })
            } else if (type === 'parameter') {
              onChange({ type, parameterId: controller.draft.resources.parameters[0]?.id ?? '' })
            } else if (type === 'counter') {
              onChange({ type, counterId: controller.draft.resources.counters[0]?.id ?? '' })
            }
          }}
        >
          <SelectTrigger id={`workflow-expression-kind-${generatedId}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="literal">固定数值</SelectItem>
            <SelectItem value="parameter">数值参数</SelectItem>
            <SelectItem value="counter">运行计数器</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {expression.type === 'literal' ? (
        <NumberField
          disabled={disabled}
          label="固定值"
          min={min}
          step={1}
          value={expression.value}
          onChange={(value) => onChange({ type: 'literal', value })}
        />
      ) : null}

      {expression.type === 'parameter' ? (
        <Field label="数值参数" htmlFor={`workflow-expression-parameter-${generatedId}`}>
          <Select
            disabled={disabled}
            value={expression.parameterId || '__none__'}
            onValueChange={(parameterId) =>
              onChange({
                type: 'parameter',
                parameterId: parameterId === '__none__' ? '' : parameterId
              })
            }
          >
            <SelectTrigger id={`workflow-expression-parameter-${generatedId}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {controller.draft.resources.parameters.length === 0 ? (
                <SelectItem value="__none__">未配置数值参数</SelectItem>
              ) : null}
              {controller.draft.resources.parameters.map((parameter) => (
                <SelectItem key={parameter.id} value={parameter.id}>
                  {parameter.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      {expression.type === 'counter' ? (
        <Field label="运行计数器" htmlFor={`workflow-expression-counter-${generatedId}`}>
          <Select
            disabled={disabled}
            value={expression.counterId || '__none__'}
            onValueChange={(counterId) =>
              onChange({
                type: 'counter',
                counterId: counterId === '__none__' ? '' : counterId
              })
            }
          >
            <SelectTrigger id={`workflow-expression-counter-${generatedId}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {controller.draft.resources.counters.length === 0 ? (
                <SelectItem value="__none__">未配置运行计数器</SelectItem>
              ) : null}
              {controller.draft.resources.counters.map((counter) => (
                <SelectItem key={counter.id} value={counter.id}>
                  {counter.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}
    </fieldset>
  )
}

function Field({
  children,
  htmlFor,
  label
}: {
  children: React.ReactNode
  htmlFor: string
  label: string
}): React.JSX.Element {
  return (
    <div className="ui-field visual-workflow-field">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function NumberField({
  disabled,
  label,
  max,
  min,
  onChange,
  step,
  value
}: {
  disabled: boolean
  label: string
  max?: number
  min?: number
  onChange: (value: number) => void
  step: number
  value: number
}): React.JSX.Element {
  const generatedId = useId()
  const id = `workflow-number-${generatedId.replace(/:/g, '')}`
  return (
    <Field htmlFor={id} label={label}>
      <Input
        disabled={disabled}
        id={id}
        max={max}
        min={min}
        step={step}
        type="number"
        value={value}
        onChange={(event) => {
          const parsed = event.currentTarget.valueAsNumber
          if (!Number.isFinite(parsed)) return
          const bounded = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, parsed))
          const normalized =
            step >= 1
              ? Math.max(
                  Number.MIN_SAFE_INTEGER,
                  Math.min(Number.MAX_SAFE_INTEGER, Math.round(bounded))
                )
              : bounded
          onChange(normalized)
        }}
      />
    </Field>
  )
}
