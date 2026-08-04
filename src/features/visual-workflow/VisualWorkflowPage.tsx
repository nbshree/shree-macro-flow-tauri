import {
  Activity,
  Camera,
  CheckCircle2,
  CircleAlert,
  Crosshair,
  Eye,
  FileCheck2,
  Hash,
  ImagePlus,
  LoaderCircle,
  MousePointerClick,
  Play,
  Plus,
  RefreshCw,
  Save,
  ScrollText,
  SlidersHorizontal,
  Square,
  Trash2,
  WandSparkles,
  Workflow as WorkflowIcon
} from 'lucide-react'

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
import type { VisualWorkflowController } from '../../hooks/useVisualWorkflowController'
import type {
  VisualWorkflowActivity,
  VisualWorkflowCounterResource,
  VisualWorkflowDetectorResource,
  VisualWorkflowNumberParameter,
  VisualWorkflowPointResource
} from '../../lib/macro-api'
import { VisualWorkflowConditionEditor, VisualWorkflowInspector } from './VisualWorkflowInspector'
import { VisualWorkflowTree } from './VisualWorkflowTree'
import { RegionSelector } from '../buff-assistant/RegionSelector'

import './VisualWorkflowPage.css'

function workflowInteger(value: string, fallback: number): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(Number.MIN_SAFE_INTEGER, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(parsed)))
}

export function VisualWorkflowPage({
  controller
}: {
  controller: VisualWorkflowController
}): React.JSX.Element {
  const status = activityStatus(controller.state.activity, controller.state.countdownRemaining)
  const error = controller.error ?? controller.state.lastError
  const pending = controller.busyAction
  const stoppable =
    controller.state.isRunning ||
    ['countdown', 'running', 'waiting', 'testing'].includes(controller.state.activity)

  return (
    <div className="visual-workflow-page">
      <section className="ui-panel visual-workflow-toolbar" aria-labelledby="visual-workflow-title">
        <div className="visual-workflow-identity">
          <span className="visual-workflow-mark" aria-hidden="true">
            <WorkflowIcon />
          </span>
          <div>
            <span className="visual-workflow-eyebrow">视觉流程 · 结构化自动化</span>
            <h2 id="visual-workflow-title">{controller.draft.name || '未命名流程'}</h2>
            <p>组合点位、图片识别、条件与循环；运行时冻结配置并始终保留紧急停止。</p>
          </div>
        </div>

        <div className="visual-workflow-toolbar-actions">
          <Badge className="visual-workflow-status" data-tone={status.tone} variant="outline">
            <Activity aria-hidden="true" />
            {status.label}
          </Badge>
          <Button
            disabled={controller.isLocked}
            title="覆盖当前草稿并载入一个有界的抢购流程示例"
            type="button"
            variant="outline"
            onClick={controller.loadPurchaseExample}
          >
            <WandSparkles aria-hidden="true" />
            载入抢购示例
          </Button>
          <Button
            disabled={controller.isLocked || !controller.isDirty}
            type="button"
            variant="outline"
            onClick={() => void controller.save()}
          >
            {pending === 'save' ? (
              <LoaderCircle aria-hidden="true" className="visual-workflow-spinner" />
            ) : (
              <Save aria-hidden="true" />
            )}
            {pending === 'save' ? '保存中…' : '保存'}
          </Button>
          <Button
            disabled={controller.isLocked}
            type="button"
            variant="outline"
            onClick={() => void controller.validate()}
          >
            {pending === 'validate' ? (
              <LoaderCircle aria-hidden="true" className="visual-workflow-spinner" />
            ) : (
              <FileCheck2 aria-hidden="true" />
            )}
            {pending === 'validate' ? '校验中…' : '校验'}
          </Button>
          {stoppable ? (
            <Button
              disabled={pending !== null}
              type="button"
              variant="destructive"
              onClick={() => void controller.stop()}
            >
              <Square aria-hidden="true" />
              {pending === 'stop' ? '停止中…' : '停止'}
            </Button>
          ) : (
            <Button
              disabled={controller.isLocked || controller.hasErrors}
              type="button"
              onClick={() => void controller.start()}
            >
              {pending === 'start' ? (
                <LoaderCircle aria-hidden="true" className="visual-workflow-spinner" />
              ) : (
                <Play aria-hidden="true" />
              )}
              {pending === 'start' ? '启动中…' : '开始运行'}
            </Button>
          )}
        </div>
      </section>

      {error ? (
        <Alert className="visual-workflow-error" variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="visual-workflow-editor">
        <aside className="visual-workflow-left" aria-label="流程概览与资源库">
          <WorkflowOverview controller={controller} status={status.label} />
          <CaptureWorkbench controller={controller} />
          <ResourceLibrary controller={controller} />
          <SafetyGuardLibrary controller={controller} />
        </aside>

        <main className="visual-workflow-center">
          <VisualWorkflowTree controller={controller} />
          <WorkflowFeedback controller={controller} />
        </main>

        <aside className="visual-workflow-right" aria-label="所选项目属性">
          <VisualWorkflowInspector controller={controller} />
        </aside>
      </div>
    </div>
  )
}

function CaptureWorkbench({
  controller
}: {
  controller: VisualWorkflowController
}): React.JSX.Element {
  const point =
    controller.selection.kind === 'point'
      ? (controller.draft.resources.points.find((item) => item.id === controller.selection.id) ??
        null)
      : null
  const detector =
    controller.selection.kind === 'detector'
      ? (controller.draft.resources.detectors.find((item) => item.id === controller.selection.id) ??
        null)
      : null
  const pending = controller.busyAction

  return (
    <section className="ui-panel visual-workflow-capture" aria-labelledby="workflow-capture-title">
      <header className="visual-workflow-section-heading">
        <div>
          <h2 id="workflow-capture-title">
            <Camera aria-hidden="true" />
            窗口预览与采集
          </h2>
          <p>选择窗口截图，再点选点位或框选识别区域</p>
        </div>
      </header>

      <div className="visual-workflow-capture-controls">
        <Button
          aria-label="刷新可捕获窗口"
          disabled={controller.isLocked}
          size="icon-compact"
          title="刷新窗口"
          type="button"
          variant="outline"
          onClick={() => void controller.refreshWindows()}
        >
          <RefreshCw
            aria-hidden="true"
            className={pending === 'windows' ? 'visual-workflow-spinner' : undefined}
          />
        </Button>
        <Select
          disabled={controller.isLocked || controller.windows.length === 0}
          value={controller.selectedWindowId}
          onValueChange={controller.setSelectedWindowId}
        >
          <SelectTrigger aria-label="目标窗口">
            <SelectValue placeholder="先刷新窗口" />
          </SelectTrigger>
          <SelectContent>
            {controller.windows.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.windowTitle || candidate.processName} · {candidate.width}×
                {candidate.height}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          disabled={controller.isLocked || !controller.selectedWindowId}
          type="button"
          variant="outline"
          onClick={() => void controller.capturePreview()}
        >
          {pending === 'preview' ? (
            <LoaderCircle aria-hidden="true" className="visual-workflow-spinner" />
          ) : (
            <Camera aria-hidden="true" />
          )}
          截图
        </Button>
      </div>

      {controller.draft.target ? (
        <p className="visual-workflow-capture-target">
          已绑定：{controller.draft.target.windowTitle || controller.draft.target.processName} ·{' '}
          {controller.draft.target.referenceWidth}×{controller.draft.target.referenceHeight}
        </p>
      ) : null}

      {controller.preview ? (
        <div className="visual-workflow-capture-preview">
          {point && point.location.mode === 'windowRelative' ? (
            <PointPreview controller={controller} point={point} />
          ) : detector ? (
            <RegionSelector
              imageUrl={controller.preview.dataUrl}
              label={`${detector.name} 搜索区域`}
              value={detector.searchRegion}
              onChange={(searchRegion) => controller.updateDetector(detector.id, { searchRegion })}
            />
          ) : (
            <img alt="目标窗口捕获预览" src={controller.preview.dataUrl} />
          )}

          {detector ? (
            <div className="visual-workflow-capture-actions">
              <Button
                disabled={controller.isLocked}
                type="button"
                onClick={() => void controller.saveDetectorTemplate(detector.id)}
              >
                {pending === 'saveTemplate' ? (
                  <LoaderCircle aria-hidden="true" className="visual-workflow-spinner" />
                ) : (
                  <ImagePlus aria-hidden="true" />
                )}
                将选区采集为模板
              </Button>
              {detector.template.assetId ? (
                <Button
                  disabled={controller.isLocked}
                  type="button"
                  variant="outline"
                  onClick={() => void controller.deleteDetectorTemplate(detector.id)}
                >
                  <Trash2 aria-hidden="true" />
                  删除模板
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="visual-workflow-capture-empty">
          <Camera aria-hidden="true" />
          <span>刷新并选择窗口后截图。运行时仍需在 3 秒倒计时内切回同一目标窗口。</span>
        </div>
      )}
    </section>
  )
}

function PointPreview({
  controller,
  point
}: {
  controller: VisualWorkflowController
  point: VisualWorkflowPointResource
}): React.JSX.Element {
  const relative = point.location.mode === 'windowRelative' ? point.location : null
  return (
    <figure
      aria-label={`窗口预览点位画布 ${point.name}`}
      className="visual-workflow-point-preview"
      data-disabled={controller.isLocked}
      onPointerDown={(event) => {
        if (controller.isLocked || event.button !== 0) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (bounds.width <= 0 || bounds.height <= 0) return
        controller.setPointFromPreview(
          point.id,
          (event.clientX - bounds.left) / bounds.width,
          (event.clientY - bounds.top) / bounds.height
        )
      }}
    >
      <img alt="目标窗口捕获预览" draggable={false} src={controller.preview?.dataUrl} />
      {relative ? (
        <span
          aria-hidden="true"
          className="visual-workflow-point-marker"
          style={{ left: `${relative.x * 100}%`, top: `${relative.y * 100}%` }}
        >
          <MousePointerClick />
        </span>
      ) : null}
      <figcaption>
        <small>鼠标点击画面设置“{point.name}”；键盘请使用右侧 X/Y 输入</small>
      </figcaption>
    </figure>
  )
}

function WorkflowOverview({
  controller,
  status
}: {
  controller: VisualWorkflowController
  status: string
}): React.JSX.Element {
  const resources = controller.draft.resources
  return (
    <section
      className="ui-panel visual-workflow-overview"
      aria-labelledby="workflow-overview-title"
    >
      <header className="visual-workflow-section-heading">
        <div>
          <h2 id="workflow-overview-title">
            <Activity aria-hidden="true" />
            方案概览
          </h2>
          <p>{controller.isDirty ? '有未保存更改' : '配置已与本地存储同步'}</p>
        </div>
      </header>

      <div className="visual-workflow-overview-grid">
        <div>
          <span>运行状态</span>
          <strong>{status}</strong>
        </div>
        <div>
          <span>校验问题</span>
          <strong>{controller.diagnostics.length}</strong>
        </div>
        <div>
          <span>点击点位</span>
          <strong>{resources.points.length}</strong>
        </div>
        <div>
          <span>图片识别器</span>
          <strong>{resources.detectors.length}</strong>
        </div>
      </div>

      <div className="visual-workflow-name-fields">
        <div className="ui-field">
          <Label htmlFor="visual-workflow-name">方案名称</Label>
          <Input
            disabled={controller.isLocked}
            id="visual-workflow-name"
            maxLength={64}
            value={controller.draft.name}
            onChange={(event) => controller.updateDefinition({ name: event.target.value })}
          />
        </div>
        <div className="ui-field">
          <Label htmlFor="visual-workflow-description">用途说明</Label>
          <Input
            disabled={controller.isLocked}
            id="visual-workflow-description"
            maxLength={160}
            value={controller.draft.description ?? ''}
            onChange={(event) =>
              controller.updateDefinition({ description: event.target.value || undefined })
            }
          />
        </div>
      </div>
    </section>
  )
}

function ResourceLibrary({
  controller
}: {
  controller: VisualWorkflowController
}): React.JSX.Element {
  const { counters, detectors, parameters, points } = controller.draft.resources
  return (
    <section
      className="ui-panel visual-workflow-resources"
      aria-labelledby="workflow-resources-title"
    >
      <header className="visual-workflow-section-heading">
        <div>
          <h2 id="workflow-resources-title">
            <ImagePlus aria-hidden="true" />
            资源库
          </h2>
          <p>步骤通过名称引用点位和识别器</p>
        </div>
      </header>

      <ResourceGroup
        action={
          <Button
            aria-label="添加点击点位"
            disabled={controller.isLocked}
            size="icon-compact"
            title="添加点击点位"
            type="button"
            variant="outline"
            onClick={controller.addPoint}
          >
            <Plus aria-hidden="true" />
          </Button>
        }
        count={points.length}
        icon={<Crosshair aria-hidden="true" />}
        title="点击点位"
      >
        {points.length === 0 ? (
          <ResourceEmpty label="还没有点位，添加后可在点击步骤中引用。" />
        ) : (
          points.map((point) => (
            <PointResourceItem controller={controller} key={point.id} point={point} />
          ))
        )}
      </ResourceGroup>

      <ResourceGroup
        action={
          <Button
            aria-label="添加图片识别器"
            disabled={controller.isLocked}
            size="icon-compact"
            title="添加图片识别器"
            type="button"
            variant="outline"
            onClick={controller.addDetector}
          >
            <Plus aria-hidden="true" />
          </Button>
        }
        count={detectors.length}
        icon={<Eye aria-hidden="true" />}
        title="图片识别器"
      >
        {detectors.length === 0 ? (
          <ResourceEmpty label="还没有识别器，添加后可用于等待和条件判断。" />
        ) : (
          detectors.map((detector) => (
            <DetectorResourceItem controller={controller} detector={detector} key={detector.id} />
          ))
        )}
      </ResourceGroup>

      <ResourceGroup
        action={
          <Button
            aria-label="添加数值参数"
            disabled={controller.isLocked}
            size="icon-compact"
            title="添加数值参数"
            type="button"
            variant="outline"
            onClick={controller.addParameter}
          >
            <Plus aria-hidden="true" />
          </Button>
        }
        count={parameters.length}
        icon={<SlidersHorizontal aria-hidden="true" />}
        title="数值参数"
      >
        {parameters.length === 0 ? (
          <ResourceEmpty label="示例中的循环次数和等待时间会显示在这里。" />
        ) : (
          parameters.map((parameter) => (
            <ParameterResourceItem
              controller={controller}
              key={parameter.id}
              parameter={parameter}
            />
          ))
        )}
      </ResourceGroup>

      <ResourceGroup
        action={
          <Button
            aria-label="添加运行计数器"
            disabled={controller.isLocked}
            size="icon-compact"
            title="添加运行计数器"
            type="button"
            variant="outline"
            onClick={controller.addCounter}
          >
            <Plus aria-hidden="true" />
          </Button>
        }
        count={counters.length}
        icon={<Hash aria-hidden="true" />}
        title="运行计数器"
      >
        {counters.length === 0 ? (
          <ResourceEmpty label="计数器用于记录运行过程中的点击尝试等状态。" />
        ) : (
          counters.map((counter) => (
            <CounterResourceItem controller={controller} counter={counter} key={counter.id} />
          ))
        )}
      </ResourceGroup>
    </section>
  )
}

function ResourceGroup({
  action,
  children,
  count,
  icon,
  title
}: {
  action: React.ReactNode
  children: React.ReactNode
  count: number
  icon: React.ReactNode
  title: string
}): React.JSX.Element {
  return (
    <div className="visual-workflow-resource-group">
      <div className="visual-workflow-resource-heading">
        <h3>
          {icon}
          {title}
          <span>{count}</span>
        </h3>
        {action}
      </div>
      <div className="visual-workflow-resource-list">{children}</div>
    </div>
  )
}

function ParameterResourceItem({
  controller,
  parameter
}: {
  controller: VisualWorkflowController
  parameter: VisualWorkflowNumberParameter
}): React.JSX.Element {
  return (
    <div className="visual-workflow-resource-editor">
      <Input
        aria-label={`参数名称 ${parameter.name}`}
        disabled={controller.isLocked}
        maxLength={64}
        value={parameter.name}
        onChange={(event) => controller.updateParameter(parameter.id, { name: event.target.value })}
      />
      <div className="visual-workflow-resource-value">
        <Label htmlFor={`visual-workflow-parameter-${parameter.id}`}>默认值</Label>
        <Input
          disabled={controller.isLocked}
          id={`visual-workflow-parameter-${parameter.id}`}
          max={parameter.maxValue}
          min={parameter.minValue}
          step={1}
          type="number"
          value={parameter.defaultValue}
          onChange={(event) =>
            controller.updateParameter(parameter.id, {
              defaultValue: workflowInteger(event.currentTarget.value, parameter.defaultValue)
            })
          }
        />
      </div>
      <div className="visual-workflow-resource-value visual-workflow-resource-value--range">
        <Label htmlFor={`visual-workflow-parameter-min-${parameter.id}`}>最小值</Label>
        <Input
          disabled={controller.isLocked}
          id={`visual-workflow-parameter-min-${parameter.id}`}
          max={Number.MAX_SAFE_INTEGER}
          min={Number.MIN_SAFE_INTEGER}
          step={1}
          type="number"
          value={parameter.minValue}
          onChange={(event) =>
            controller.updateParameter(parameter.id, {
              minValue: workflowInteger(event.currentTarget.value, parameter.minValue)
            })
          }
        />
        <Label htmlFor={`visual-workflow-parameter-max-${parameter.id}`}>最大值</Label>
        <Input
          disabled={controller.isLocked}
          id={`visual-workflow-parameter-max-${parameter.id}`}
          max={Number.MAX_SAFE_INTEGER}
          min={Number.MIN_SAFE_INTEGER}
          step={1}
          type="number"
          value={parameter.maxValue}
          onChange={(event) =>
            controller.updateParameter(parameter.id, {
              maxValue: workflowInteger(event.currentTarget.value, parameter.maxValue)
            })
          }
        />
      </div>
      <Button
        aria-label={`删除数值参数 ${parameter.name}`}
        disabled={controller.isLocked}
        size="icon-compact"
        title="删除参数"
        type="button"
        variant="ghost"
        onClick={() => controller.removeParameter(parameter.id)}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  )
}

function CounterResourceItem({
  controller,
  counter
}: {
  controller: VisualWorkflowController
  counter: VisualWorkflowCounterResource
}): React.JSX.Element {
  return (
    <div className="visual-workflow-resource-editor">
      <Input
        aria-label={`计数器名称 ${counter.name}`}
        disabled={controller.isLocked}
        maxLength={64}
        value={counter.name}
        onChange={(event) => controller.updateCounter(counter.id, { name: event.target.value })}
      />
      <div className="visual-workflow-resource-value">
        <Label htmlFor={`visual-workflow-counter-${counter.id}`}>初始值</Label>
        <Input
          disabled={controller.isLocked}
          id={`visual-workflow-counter-${counter.id}`}
          max={Number.MAX_SAFE_INTEGER}
          min={Number.MIN_SAFE_INTEGER}
          step={1}
          type="number"
          value={counter.initialValue}
          onChange={(event) =>
            controller.updateCounter(counter.id, {
              initialValue: workflowInteger(event.currentTarget.value, counter.initialValue)
            })
          }
        />
      </div>
      <Button
        aria-label={`删除运行计数器 ${counter.name}`}
        disabled={controller.isLocked}
        size="icon-compact"
        title="删除计数器"
        type="button"
        variant="ghost"
        onClick={() => controller.removeCounter(counter.id)}
      >
        <Trash2 aria-hidden="true" />
      </Button>
    </div>
  )
}

function SafetyGuardLibrary({
  controller
}: {
  controller: VisualWorkflowController
}): React.JSX.Element {
  return (
    <section className="ui-panel visual-workflow-guards" aria-labelledby="workflow-guards-title">
      <header className="visual-workflow-section-heading">
        <div>
          <h2 id="workflow-guards-title">
            <CircleAlert aria-hidden="true" />
            全局安全保护
          </h2>
          <p>任一条件成立，或识别状态未知，都会在下一次输入前停止</p>
        </div>
        <Button
          aria-label="添加全局安全保护"
          disabled={controller.isLocked}
          size="icon-compact"
          title="添加安全保护"
          type="button"
          variant="outline"
          onClick={controller.addSafetyGuard}
        >
          <Plus aria-hidden="true" />
        </Button>
      </header>

      {controller.draft.safetyGuards.length === 0 ? (
        <ResourceEmpty label="尚未配置安全保护；建议至少添加目标窗口或保护图标条件。" />
      ) : (
        <div className="visual-workflow-guard-list">
          {controller.draft.safetyGuards.map((guard, index) => (
            <fieldset className="visual-workflow-guard" key={`guard-${index}`}>
              <legend>保护 {index + 1}</legend>
              <VisualWorkflowConditionEditor
                condition={guard.condition}
                controller={controller}
                legend="触发条件"
                onChange={(condition) => controller.updateSafetyGuard(index, { condition })}
              />
              <div className="ui-field">
                <Label htmlFor={`visual-workflow-guard-message-${index}`}>停止提示</Label>
                <Input
                  disabled={controller.isLocked}
                  id={`visual-workflow-guard-message-${index}`}
                  value={guard.message}
                  onChange={(event) =>
                    controller.updateSafetyGuard(index, { message: event.target.value })
                  }
                />
              </div>
              <Button
                disabled={controller.isLocked}
                type="button"
                variant="destructive"
                onClick={() => controller.removeSafetyGuard(index)}
              >
                <Trash2 aria-hidden="true" />
                删除保护
              </Button>
            </fieldset>
          ))}
        </div>
      )}
    </section>
  )
}

function ResourceEmpty({ label }: { label: string }): React.JSX.Element {
  return <p className="visual-workflow-resource-empty">{label}</p>
}

function PointResourceItem({
  controller,
  point
}: {
  controller: VisualWorkflowController
  point: VisualWorkflowPointResource
}): React.JSX.Element {
  const selected = controller.selection.kind === 'point' && controller.selection.id === point.id
  const coordinates =
    point.location.mode === 'windowRelative'
      ? `${Math.round(point.location.x * 100)}%, ${Math.round(point.location.y * 100)}%`
      : `${point.location.x}, ${point.location.y} px`

  return (
    <button
      aria-label={`选择点位 ${point.name}`}
      aria-pressed={selected}
      className="visual-workflow-resource-item"
      data-selected={String(selected)}
      type="button"
      onClick={() => controller.setSelection({ kind: 'point', id: point.id })}
    >
      <span className="visual-workflow-resource-icon">
        <Crosshair aria-hidden="true" />
      </span>
      <span>
        <strong>{point.name}</strong>
        <small>{coordinates}</small>
      </span>
    </button>
  )
}

function DetectorResourceItem({
  controller,
  detector
}: {
  controller: VisualWorkflowController
  detector: VisualWorkflowDetectorResource
}): React.JSX.Element {
  const selected =
    controller.selection.kind === 'detector' && controller.selection.id === detector.id
  return (
    <button
      aria-label={`选择识别器 ${detector.name}`}
      aria-pressed={selected}
      className="visual-workflow-resource-item"
      data-selected={String(selected)}
      type="button"
      onClick={() => controller.setSelection({ kind: 'detector', id: detector.id })}
    >
      <span className="visual-workflow-resource-icon">
        <Eye aria-hidden="true" />
      </span>
      <span>
        <strong>{detector.name}</strong>
        <small>
          {Math.round(detector.matchThreshold * 100)}% ·{' '}
          {detector.template.assetId ? '模板已配置' : '模板待配置'}
        </small>
      </span>
    </button>
  )
}

function WorkflowFeedback({
  controller
}: {
  controller: VisualWorkflowController
}): React.JSX.Element {
  return (
    <div className="visual-workflow-feedback-grid">
      <section
        className="ui-panel visual-workflow-feedback"
        aria-labelledby="workflow-issues-title"
      >
        <header className="visual-workflow-feedback-heading">
          <h2 id="workflow-issues-title">
            <FileCheck2 aria-hidden="true" />
            校验问题
          </h2>
          <Badge variant={controller.hasErrors ? 'destructive' : 'outline'}>
            {controller.diagnostics.length}
          </Badge>
        </header>
        <div className="visual-workflow-feedback-body" aria-live="polite">
          {controller.diagnostics.length === 0 ? (
            <div className="visual-workflow-feedback-empty">
              <CheckCircle2 aria-hidden="true" />
              <span>尚未发现问题；修改后可再次校验。</span>
            </div>
          ) : (
            controller.diagnostics.map((diagnostic, index) => (
              <div
                className="visual-workflow-diagnostic"
                data-severity={diagnostic.severity}
                key={`${diagnostic.path}-${diagnostic.code}-${index}`}
              >
                <CircleAlert aria-hidden="true" />
                <div>
                  <strong>{diagnostic.message}</strong>
                  <code>{diagnostic.path}</code>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="ui-panel visual-workflow-feedback" aria-labelledby="workflow-logs-title">
        <header className="visual-workflow-feedback-heading">
          <h2 id="workflow-logs-title">
            <ScrollText aria-hidden="true" />
            执行日志
          </h2>
          <Button
            aria-label="清空视觉流程日志"
            disabled={controller.logs.length === 0}
            size="icon-compact"
            title="清空日志"
            type="button"
            variant="ghost"
            onClick={controller.clearLogs}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </header>
        <div className="visual-workflow-feedback-body visual-workflow-log" aria-live="polite">
          {controller.logs.length === 0 ? (
            <div className="visual-workflow-feedback-empty">
              <ScrollText aria-hidden="true" />
              <span>运行后会在这里显示当前步骤和用户日志。</span>
            </div>
          ) : (
            controller.logs.map((message, index) => <p key={`${index}-${message}`}>{message}</p>)
          )}
        </div>
      </section>
    </div>
  )
}

function activityStatus(
  activity: VisualWorkflowActivity,
  countdownRemaining: number
): {
  label: string
  tone: 'muted' | 'primary' | 'success' | 'warning' | 'danger'
} {
  switch (activity) {
    case 'validating':
      return { label: '正在校验', tone: 'warning' }
    case 'countdown':
      return {
        label: countdownRemaining > 0 ? `启动倒计时 ${countdownRemaining}s` : '启动倒计时',
        tone: 'warning'
      }
    case 'running':
      return { label: '正在运行', tone: 'success' }
    case 'waiting':
      return { label: '等待条件', tone: 'warning' }
    case 'testing':
      return { label: '识别测试', tone: 'primary' }
    case 'completed':
      return { label: '运行完成', tone: 'primary' }
    case 'error':
      return { label: '异常停止', tone: 'danger' }
    default:
      return { label: '待命', tone: 'muted' }
  }
}
