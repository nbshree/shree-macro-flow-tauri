import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type {
  BuffCapturePreview,
  CaptureWindowCandidate,
  NormalizedRect,
  VisualWorkflowCondition,
  VisualWorkflowCounterResource,
  VisualWorkflowDefinition,
  VisualWorkflowDetectorResource,
  VisualWorkflowDiagnostic,
  VisualWorkflowNumberExpression,
  VisualWorkflowNumberParameter,
  VisualWorkflowPointResource,
  VisualWorkflowState,
  VisualWorkflowStep
} from '../lib/macro-api'

export type VisualWorkflowStepType = VisualWorkflowStep['type']

export type VisualWorkflowSelection =
  { kind: 'step'; id: string } | { kind: 'point'; id: string } | { kind: 'detector'; id: string }

export type VisualWorkflowController = {
  state: VisualWorkflowState
  draft: VisualWorkflowDefinition
  diagnostics: VisualWorkflowDiagnostic[]
  logs: string[]
  selection: VisualWorkflowSelection
  selectedStep: VisualWorkflowStep | null
  windows: CaptureWindowCandidate[]
  selectedWindowId: string
  preview: BuffCapturePreview | null
  busyAction:
    | 'save'
    | 'validate'
    | 'start'
    | 'stop'
    | 'windows'
    | 'preview'
    | 'saveTemplate'
    | 'deleteTemplate'
    | null
  error: string | null
  isDirty: boolean
  isLocked: boolean
  hasErrors: boolean
  setSelection: (selection: VisualWorkflowSelection) => void
  setSelectedWindowId: (windowId: string) => void
  updateDefinition: (patch: Partial<Pick<VisualWorkflowDefinition, 'name' | 'description'>>) => void
  updateStep: (id: string, updater: (current: VisualWorkflowStep) => VisualWorkflowStep) => void
  addStep: (type: VisualWorkflowStepType) => void
  removeStep: (id: string) => void
  moveStep: (id: string, direction: 'up' | 'down') => void
  canMoveStep: (id: string, direction: 'up' | 'down') => boolean
  addPoint: () => void
  updatePoint: (id: string, patch: Partial<VisualWorkflowPointResource>) => void
  removePoint: (id: string) => void
  addDetector: () => void
  updateDetector: (id: string, patch: Partial<VisualWorkflowDetectorResource>) => void
  removeDetector: (id: string) => void
  addParameter: () => void
  updateParameter: (id: string, patch: Partial<VisualWorkflowNumberParameter>) => void
  removeParameter: (id: string) => void
  addCounter: () => void
  updateCounter: (id: string, patch: Partial<VisualWorkflowCounterResource>) => void
  removeCounter: (id: string) => void
  addSafetyGuard: () => void
  updateSafetyGuard: (
    index: number,
    patch: Partial<VisualWorkflowDefinition['safetyGuards'][number]>
  ) => void
  removeSafetyGuard: (index: number) => void
  loadPurchaseExample: () => void
  refreshWindows: () => Promise<void>
  capturePreview: () => Promise<void>
  setPointFromPreview: (id: string, x: number, y: number) => void
  saveDetectorTemplate: (id: string, crop?: NormalizedRect) => Promise<void>
  deleteDetectorTemplate: (id: string) => Promise<void>
  save: () => Promise<void>
  validate: () => Promise<VisualWorkflowDiagnostic[]>
  start: () => Promise<void>
  stop: () => Promise<void>
  clearLogs: () => void
}

let fallbackId = 0

function createId(prefix: string): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`
  }
  fallbackId += 1
  return `${prefix}-${Date.now()}-${fallbackId}`
}

function createSequenceStep(label = '步骤组'): VisualWorkflowStep {
  return {
    id: createId('step'),
    label,
    enabled: true,
    type: 'sequence',
    steps: []
  }
}

export function createEmptyVisualWorkflowDefinition(): VisualWorkflowDefinition {
  return {
    schemaVersion: 1,
    id: createId('workflow'),
    name: '新建视觉流程',
    description: '通过点位、图片识别和条件步骤搭建自动化流程。',
    target: null,
    resources: {
      points: [],
      detectors: [],
      parameters: [],
      counters: []
    },
    safetyGuards: [],
    root: {
      id: 'root',
      label: '主流程',
      enabled: true,
      type: 'sequence',
      steps: []
    }
  }
}

export function createPurchaseExampleVisualWorkflowDefinition(): VisualWorkflowDefinition {
  const purchaseCountParameterId = 'purchase-count'
  const clickIntervalParameterId = 'click-interval-ms'
  const purchaseToSearchParameterId = 'purchase-to-search-ms'
  const searchToClickParameterId = 'search-to-click-ms'
  const purchaseAttemptsCounterId = 'purchase-attempts'
  const recordPointId = 'record-point'
  const purchasePointId = 'purchase-point'
  const searchPointId = 'search-point'
  const purchaseIconDetectorId = 'purchase-icon'
  const marketGuardDetectorId = 'market-guard'

  return {
    schemaVersion: 1,
    id: createId('purchase-example'),
    name: '交易行抢购示例',
    description: '识别购买入口并执行有界的购买点击尝试；点击尝试不代表成交。',
    target: null,
    resources: {
      points: [
        {
          id: recordPointId,
          name: '记录商品点位',
          location: { mode: 'windowRelative', x: 0.37, y: 0.34 }
        },
        {
          id: purchasePointId,
          name: '购买按钮点位',
          location: { mode: 'windowRelative', x: 0.82, y: 0.82 }
        },
        {
          id: searchPointId,
          name: '搜索按钮点位',
          location: { mode: 'windowRelative', x: 0.77, y: 0.18 }
        }
      ],
      detectors: [
        {
          id: purchaseIconDetectorId,
          name: '购买图标',
          searchRegion: { x: 0.68, y: 0.68, width: 0.28, height: 0.27 },
          template: {
            assetId: '',
            width: 0,
            height: 0,
            captureReferenceWidth: 0,
            captureReferenceHeight: 0
          },
          matchThreshold: 0.95,
          confirmFrames: 2,
          missingFrames: 3,
          staleAfterMs: 500
        },
        {
          id: marketGuardDetectorId,
          name: '交易行保护标志',
          searchRegion: { x: 0.02, y: 0.02, width: 0.25, height: 0.16 },
          template: {
            assetId: '',
            width: 0,
            height: 0,
            captureReferenceWidth: 0,
            captureReferenceHeight: 0
          },
          matchThreshold: 0.95,
          confirmFrames: 2,
          missingFrames: 3,
          staleAfterMs: 500
        }
      ],
      parameters: [
        {
          id: purchaseCountParameterId,
          name: '购买点击尝试次数',
          defaultValue: 3,
          minValue: 1,
          maxValue: 20
        },
        {
          id: clickIntervalParameterId,
          name: '记录点点击间隔',
          defaultValue: 80,
          minValue: 20,
          maxValue: 2_000
        },
        {
          id: purchaseToSearchParameterId,
          name: '购买点击后等待',
          defaultValue: 350,
          minValue: 0,
          maxValue: 10_000
        },
        {
          id: searchToClickParameterId,
          name: '搜索后等待',
          defaultValue: 250,
          minValue: 0,
          maxValue: 10_000
        }
      ],
      counters: [
        {
          id: purchaseAttemptsCounterId,
          name: '已执行购买点击尝试',
          initialValue: 0
        }
      ]
    },
    safetyGuards: [
      {
        condition: {
          type: 'detectorState',
          detectorId: marketGuardDetectorId,
          state: 'absent'
        },
        message: '交易行保护标志消失，已停止购买点击尝试'
      }
    ],
    root: {
      id: 'purchase-example-root',
      label: '抢购主流程',
      enabled: true,
      type: 'sequence',
      steps: [
        {
          id: 'repeat-purchase-attempts',
          label: '执行购买点击尝试',
          enabled: true,
          type: 'repeat',
          count: { type: 'parameter', parameterId: purchaseCountParameterId },
          maxIterations: 20,
          body: {
            id: 'purchase-attempt-body',
            label: '单次购买点击尝试',
            enabled: true,
            type: 'sequence',
            steps: [
              {
                id: 'wait-old-purchase-icon-absent',
                label: '等待旧购买图标消失',
                enabled: true,
                type: 'waitUntil',
                condition: {
                  type: 'detectorState',
                  detectorId: purchaseIconDetectorId,
                  state: 'absent'
                },
                timeoutMs: { type: 'literal', value: 10_000 },
                pollIntervalMs: { type: 'literal', value: 100 }
              },
              {
                id: 'find-purchase-icon',
                label: '刷新直到购买图标出现',
                enabled: true,
                type: 'repeatUntil',
                condition: {
                  type: 'detectorState',
                  detectorId: purchaseIconDetectorId,
                  state: 'present'
                },
                timeoutMs: { type: 'literal', value: 30_000 },
                pollIntervalMs: { type: 'literal', value: 50 },
                maxIterations: 500,
                body: {
                  id: 'refresh-purchase-entry',
                  label: '刷新购买入口',
                  enabled: true,
                  type: 'sequence',
                  steps: [
                    {
                      id: 'click-record-point',
                      label: '点击记录商品',
                      enabled: true,
                      type: 'click',
                      pointId: recordPointId,
                      button: 'left',
                      clickCount: 1
                    },
                    {
                      id: 'delay-record-click',
                      label: '等待下次刷新',
                      enabled: true,
                      type: 'delay',
                      durationMs: { type: 'parameter', parameterId: clickIntervalParameterId }
                    }
                  ]
                }
              },
              {
                id: 'click-purchase-point',
                label: '执行购买点击尝试',
                enabled: true,
                type: 'click',
                pointId: purchasePointId,
                button: 'left',
                clickCount: 1
              },
              {
                id: 'count-purchase-attempt',
                label: '记录购买点击尝试',
                enabled: true,
                type: 'counterAdd',
                counterId: purchaseAttemptsCounterId,
                amount: { type: 'literal', value: 1 }
              },
              {
                id: 'prepare-next-attempt',
                label: '还有下一次尝试',
                enabled: true,
                type: 'if',
                condition: {
                  type: 'counterCompare',
                  counterId: purchaseAttemptsCounterId,
                  operator: 'lessThan',
                  value: { type: 'parameter', parameterId: purchaseCountParameterId }
                },
                thenBranch: {
                  id: 'prepare-next-attempt-body',
                  label: '返回搜索并等待',
                  enabled: true,
                  type: 'sequence',
                  steps: [
                    {
                      id: 'delay-after-purchase-click',
                      label: '购买点击后等待',
                      enabled: true,
                      type: 'delay',
                      durationMs: {
                        type: 'parameter',
                        parameterId: purchaseToSearchParameterId
                      }
                    },
                    {
                      id: 'click-search-point',
                      label: '点击搜索',
                      enabled: true,
                      type: 'click',
                      pointId: searchPointId,
                      button: 'left',
                      clickCount: 1
                    },
                    {
                      id: 'delay-after-search',
                      label: '搜索后等待',
                      enabled: true,
                      type: 'delay',
                      durationMs: { type: 'parameter', parameterId: searchToClickParameterId }
                    }
                  ]
                }
              }
            ]
          }
        },
        {
          id: 'finish-purchase-example',
          label: '结束示例',
          enabled: true,
          type: 'finish',
          outcome: 'success',
          message: '已完成配置的购买点击尝试；点击尝试不代表成交结果'
        }
      ]
    }
  }
}

function createPurchaseExampleDiagnostics(
  definition: VisualWorkflowDefinition
): VisualWorkflowDiagnostic[] {
  return [
    {
      path: '$.target',
      severity: 'error' as const,
      code: 'targetPendingCapture',
      message: '请先在“窗口预览与采集”中选择并截图目标窗口。'
    },
    ...definition.resources.detectors.map((detector, index) => ({
      path: `$.resources.detectors[${index}].template`,
      severity: 'error' as const,
      code: 'detectorTemplatePendingCapture',
      message: `请先为“${detector.name}”采集识别模板，再校验并运行示例。`
    }))
  ]
}

const initialDefinition = createEmptyVisualWorkflowDefinition()

export const emptyVisualWorkflowState: VisualWorkflowState = {
  runId: 0,
  definition: initialDefinition,
  activity: 'idle',
  isRunning: false,
  countdownRemaining: 0,
  currentStepId: null,
  diagnostics: [],
  lastError: null
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function selectionExists(
  definition: VisualWorkflowDefinition,
  selection: VisualWorkflowSelection
): boolean {
  if (selection.kind === 'step') {
    return Boolean(findVisualWorkflowStep(definition.root, selection.id))
  }
  if (selection.kind === 'point') {
    return definition.resources.points.some((point) => point.id === selection.id)
  }
  return definition.resources.detectors.some((detector) => detector.id === selection.id)
}

function updateNestedStep(
  step: VisualWorkflowStep,
  id: string,
  updater: (current: VisualWorkflowStep) => VisualWorkflowStep
): VisualWorkflowStep {
  if (step.id === id) return updater(step)

  switch (step.type) {
    case 'sequence':
      return { ...step, steps: step.steps.map((child) => updateNestedStep(child, id, updater)) }
    case 'if':
      return {
        ...step,
        thenBranch: updateNestedStep(step.thenBranch, id, updater),
        elseBranch: step.elseBranch ? updateNestedStep(step.elseBranch, id, updater) : undefined
      }
    case 'repeat':
    case 'repeatUntil':
      return { ...step, body: updateNestedStep(step.body, id, updater) }
    default:
      return step
  }
}

export function findVisualWorkflowStep(
  step: VisualWorkflowStep,
  id: string
): VisualWorkflowStep | null {
  if (step.id === id) return step

  switch (step.type) {
    case 'sequence':
      for (const child of step.steps) {
        const found = findVisualWorkflowStep(child, id)
        if (found) return found
      }
      return null
    case 'if':
      return (
        findVisualWorkflowStep(step.thenBranch, id) ??
        (step.elseBranch ? findVisualWorkflowStep(step.elseBranch, id) : null)
      )
    case 'repeat':
    case 'repeatUntil':
      return findVisualWorkflowStep(step.body, id)
    default:
      return null
  }
}

function removeNestedStep(step: VisualWorkflowStep, id: string): VisualWorkflowStep {
  switch (step.type) {
    case 'sequence':
      return {
        ...step,
        steps: step.steps
          .filter((child) => child.id !== id)
          .map((child) => removeNestedStep(child, id))
      }
    case 'if':
      return {
        ...step,
        thenBranch:
          step.thenBranch.id === id
            ? createSequenceStep('满足时')
            : removeNestedStep(step.thenBranch, id),
        elseBranch:
          step.elseBranch?.id === id
            ? undefined
            : step.elseBranch
              ? removeNestedStep(step.elseBranch, id)
              : undefined
      }
    case 'repeat':
    case 'repeatUntil':
      return {
        ...step,
        body: step.body.id === id ? createSequenceStep('循环体') : removeNestedStep(step.body, id)
      }
    default:
      return step
  }
}

function moveNestedStep(
  step: VisualWorkflowStep,
  id: string,
  direction: 'up' | 'down'
): VisualWorkflowStep {
  if (step.type === 'sequence') {
    const index = step.steps.findIndex((child) => child.id === id)
    if (index >= 0) {
      const targetIndex = direction === 'up' ? index - 1 : index + 1
      if (targetIndex < 0 || targetIndex >= step.steps.length) return step
      const steps = [...step.steps]
      const selectedStep = steps[index]
      steps[index] = steps[targetIndex]
      steps[targetIndex] = selectedStep
      return { ...step, steps }
    }
    return {
      ...step,
      steps: step.steps.map((child) => moveNestedStep(child, id, direction))
    }
  }

  if (step.type === 'if') {
    return {
      ...step,
      thenBranch: moveNestedStep(step.thenBranch, id, direction),
      elseBranch: step.elseBranch ? moveNestedStep(step.elseBranch, id, direction) : undefined
    }
  }

  if (step.type === 'repeat' || step.type === 'repeatUntil') {
    return { ...step, body: moveNestedStep(step.body, id, direction) }
  }

  return step
}

function canMoveNestedStep(
  step: VisualWorkflowStep,
  id: string,
  direction: 'up' | 'down'
): boolean {
  if (step.type === 'sequence') {
    const index = step.steps.findIndex((child) => child.id === id)
    if (index >= 0) return direction === 'up' ? index > 0 : index < step.steps.length - 1
    return step.steps.some((child) => canMoveNestedStep(child, id, direction))
  }

  if (step.type === 'if') {
    return (
      canMoveNestedStep(step.thenBranch, id, direction) ||
      Boolean(step.elseBranch && canMoveNestedStep(step.elseBranch, id, direction))
    )
  }

  if (step.type === 'repeat' || step.type === 'repeatUntil') {
    return canMoveNestedStep(step.body, id, direction)
  }

  return false
}

function insertStep(
  step: VisualWorkflowStep,
  selectedId: string,
  nextStep: VisualWorkflowStep
): [VisualWorkflowStep, boolean] {
  if (step.id === selectedId && step.type === 'sequence') {
    return [{ ...step, steps: [...step.steps, nextStep] }, true]
  }

  if (step.type === 'sequence') {
    const selectedIndex = step.steps.findIndex((child) => child.id === selectedId)
    if (selectedIndex >= 0) {
      const steps = [...step.steps]
      steps.splice(selectedIndex + 1, 0, nextStep)
      return [{ ...step, steps }, true]
    }

    for (let index = 0; index < step.steps.length; index += 1) {
      const [child, inserted] = insertStep(step.steps[index], selectedId, nextStep)
      if (inserted) {
        const steps = [...step.steps]
        steps[index] = child
        return [{ ...step, steps }, true]
      }
    }
    return [step, false]
  }

  if (step.type === 'if') {
    const [thenBranch, insertedInThen] = insertStep(step.thenBranch, selectedId, nextStep)
    if (insertedInThen) return [{ ...step, thenBranch }, true]
    if (step.elseBranch) {
      const [elseBranch, insertedInElse] = insertStep(step.elseBranch, selectedId, nextStep)
      if (insertedInElse) return [{ ...step, elseBranch }, true]
    }
    return [step, false]
  }

  if (step.type === 'repeat' || step.type === 'repeatUntil') {
    const [body, inserted] = insertStep(step.body, selectedId, nextStep)
    return inserted ? [{ ...step, body }, true] : [step, false]
  }

  return [step, false]
}

export function defaultCondition(definition: VisualWorkflowDefinition): VisualWorkflowCondition {
  const detector = definition.resources.detectors[0]
  return detector
    ? { type: 'detectorState', detectorId: detector.id, state: 'present' }
    : { type: 'targetState', state: 'foreground', expected: true }
}

type CountedResourceKind = 'parameter' | 'counter'

function countExpressionReferences(
  expression: VisualWorkflowNumberExpression,
  kind: CountedResourceKind,
  id: string
): number {
  if (kind === 'parameter' && expression.type === 'parameter') {
    return expression.parameterId === id ? 1 : 0
  }
  if (kind === 'counter' && expression.type === 'counter') {
    return expression.counterId === id ? 1 : 0
  }
  return 0
}

function countConditionReferences(
  condition: VisualWorkflowCondition,
  kind: CountedResourceKind,
  id: string
): number {
  switch (condition.type) {
    case 'detectorState':
    case 'targetState':
      return 0
    case 'counterCompare':
      return (
        (kind === 'counter' && condition.counterId === id ? 1 : 0) +
        countExpressionReferences(condition.value, kind, id)
      )
    case 'all':
    case 'any':
      return condition.conditions.reduce(
        (total, child) => total + countConditionReferences(child, kind, id),
        0
      )
    case 'not':
      return countConditionReferences(condition.condition, kind, id)
  }
}

function countStepReferences(
  step: VisualWorkflowStep,
  kind: CountedResourceKind,
  id: string
): number {
  switch (step.type) {
    case 'sequence':
      return step.steps.reduce((total, child) => total + countStepReferences(child, kind, id), 0)
    case 'click':
    case 'key':
    case 'log':
    case 'finish':
      return 0
    case 'delay':
      return countExpressionReferences(step.durationMs, kind, id)
    case 'if':
      return (
        countConditionReferences(step.condition, kind, id) +
        countStepReferences(step.thenBranch, kind, id) +
        (step.elseBranch ? countStepReferences(step.elseBranch, kind, id) : 0)
      )
    case 'repeat':
      return (
        countExpressionReferences(step.count, kind, id) +
        countStepReferences(step.body, kind, id)
      )
    case 'repeatUntil':
      return (
        countConditionReferences(step.condition, kind, id) +
        countExpressionReferences(step.timeoutMs, kind, id) +
        countExpressionReferences(step.pollIntervalMs, kind, id) +
        countStepReferences(step.body, kind, id)
      )
    case 'waitUntil':
      return (
        countConditionReferences(step.condition, kind, id) +
        countExpressionReferences(step.timeoutMs, kind, id) +
        countExpressionReferences(step.pollIntervalMs, kind, id)
      )
    case 'counterAdd':
      return (
        (kind === 'counter' && step.counterId === id ? 1 : 0) +
        countExpressionReferences(step.amount, kind, id)
      )
    case 'assert':
      return countConditionReferences(step.condition, kind, id)
  }
}

export function countVisualWorkflowResourceReferences(
  definition: VisualWorkflowDefinition,
  kind: CountedResourceKind,
  id: string
): number {
  return (
    countStepReferences(definition.root, kind, id) +
    definition.safetyGuards.reduce(
      (total, guard) => total + countConditionReferences(guard.condition, kind, id),
      0
    )
  )
}

function createStep(
  type: VisualWorkflowStepType,
  definition: VisualWorkflowDefinition
): VisualWorkflowStep {
  const base = { id: createId('step'), enabled: true }
  const pointId = definition.resources.points[0]?.id ?? ''
  const condition = defaultCondition(definition)

  switch (type) {
    case 'sequence':
      return { ...base, label: '步骤组', type, steps: [] }
    case 'click':
      return { ...base, label: '点击点位', type, pointId, button: 'left', clickCount: 1 }
    case 'key':
      return { ...base, label: '发送按键', type, chord: { keys: ['F'], holdMs: 0 } }
    case 'delay':
      return {
        ...base,
        label: '固定等待',
        type,
        durationMs: { type: 'literal', value: 100 }
      }
    case 'if':
      return {
        ...base,
        label: '条件判断',
        type,
        condition,
        thenBranch: createSequenceStep('满足时'),
        elseBranch: createSequenceStep('否则')
      }
    case 'repeat':
      return {
        ...base,
        label: '重复执行',
        type,
        count: { type: 'literal', value: 3 },
        maxIterations: 1000,
        body: createSequenceStep('循环体')
      }
    case 'repeatUntil':
      return {
        ...base,
        label: '重复直到',
        type,
        condition,
        timeoutMs: { type: 'literal', value: 60_000 },
        pollIntervalMs: { type: 'literal', value: 50 },
        maxIterations: 1000,
        body: createSequenceStep('循环体')
      }
    case 'waitUntil':
      return {
        ...base,
        label: '等待条件',
        type,
        condition,
        timeoutMs: { type: 'literal', value: 60_000 },
        pollIntervalMs: { type: 'literal', value: 50 }
      }
    case 'counterAdd':
      return {
        ...base,
        label: '增加计数器',
        type,
        counterId: definition.resources.counters[0]?.id ?? '',
        amount: { type: 'literal', value: 1 }
      }
    case 'assert':
      return { ...base, label: '校验条件', type, condition, message: '条件不满足，流程停止' }
    case 'log':
      return { ...base, label: '写入日志', type, message: '流程运行到这里' }
    case 'finish':
      return { ...base, label: '结束流程', type, outcome: 'success', message: '流程完成' }
  }
}

export function describeVisualWorkflowExpression(
  expression: Extract<VisualWorkflowStep, { type: 'delay' }>['durationMs'],
  definition: VisualWorkflowDefinition,
  unit?: string
): string {
  switch (expression.type) {
    case 'literal':
      return `${expression.value.toLocaleString('zh-CN')}${unit ? ` ${unit}` : ''}`
    case 'parameter':
      return (
        definition.resources.parameters.find((item) => item.id === expression.parameterId)?.name ??
        '未找到参数'
      )
    case 'counter':
      return (
        definition.resources.counters.find((item) => item.id === expression.counterId)?.name ??
        '未找到计数器'
      )
  }
}

export function describeVisualWorkflowCondition(
  condition: VisualWorkflowCondition,
  definition: VisualWorkflowDefinition
): string {
  switch (condition.type) {
    case 'detectorState': {
      const detector =
        definition.resources.detectors.find((item) => item.id === condition.detectorId)?.name ??
        '未选择识别器'
      const state =
        condition.state === 'present' ? '出现' : condition.state === 'absent' ? '消失' : '未知'
      return `“${detector}”${state}`
    }
    case 'counterCompare': {
      const counter =
        definition.resources.counters.find((item) => item.id === condition.counterId)?.name ??
        '未选择计数器'
      return `${counter} ${condition.operator} ${describeVisualWorkflowExpression(
        condition.value,
        definition
      )}`
    }
    case 'all':
      return condition.conditions.length === 0
        ? '全部条件（空）'
        : condition.conditions
            .map((item) => describeVisualWorkflowCondition(item, definition))
            .join(' 且 ')
    case 'any':
      return condition.conditions.length === 0
        ? '任一条件（空）'
        : condition.conditions
            .map((item) => describeVisualWorkflowCondition(item, definition))
            .join(' 或 ')
    case 'not':
      return `不满足 ${describeVisualWorkflowCondition(condition.condition, definition)}`
    case 'targetState': {
      const label =
        condition.state === 'foreground'
          ? '目标窗口位于前台'
          : condition.state === 'capturable'
            ? '目标窗口可截图'
            : '目标窗口存在'
      return condition.expected ? label : `不满足“${label}”`
    }
  }
}

export function describeVisualWorkflowStep(
  step: VisualWorkflowStep,
  definition: VisualWorkflowDefinition
): string {
  switch (step.type) {
    case 'sequence':
      return `顺序执行 ${step.steps.length} 个步骤`
    case 'click': {
      const point =
        definition.resources.points.find((item) => item.id === step.pointId)?.name ?? '未选择点位'
      const button = step.button === 'right' ? '右键' : step.button === 'middle' ? '中键' : '左键'
      return `${button}${step.clickCount > 1 ? `点击 ${step.clickCount} 次` : '单击'}“${point}”`
    }
    case 'key':
      return `发送按键 ${step.chord.keys.join(' + ') || '未配置'}`
    case 'delay':
      return `等待 ${describeVisualWorkflowExpression(step.durationMs, definition, 'ms')}`
    case 'if':
      return `如果 ${describeVisualWorkflowCondition(step.condition, definition)}`
    case 'repeat':
      return `重复 ${describeVisualWorkflowExpression(step.count, definition)}，最多 ${step.maxIterations} 次`
    case 'repeatUntil':
      return `重复直到 ${describeVisualWorkflowCondition(step.condition, definition)}`
    case 'waitUntil':
      return `等待 ${describeVisualWorkflowCondition(step.condition, definition)}`
    case 'counterAdd': {
      const counter =
        definition.resources.counters.find((item) => item.id === step.counterId)?.name ??
        '未选择计数器'
      return `${counter} 增加 ${describeVisualWorkflowExpression(step.amount, definition)}`
    }
    case 'assert':
      return `校验 ${describeVisualWorkflowCondition(step.condition, definition)}`
    case 'log':
      return `记录“${step.message || '空日志'}”`
    case 'finish':
      return step.outcome === 'success' ? '正常结束流程' : '异常结束流程'
  }
}

export function useVisualWorkflowController(): VisualWorkflowController {
  const [state, setState] = useState<VisualWorkflowState>(emptyVisualWorkflowState)
  const [draft, setDraftState] = useState<VisualWorkflowDefinition>(initialDefinition)
  const [diagnostics, setDiagnostics] = useState<VisualWorkflowDiagnostic[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [windows, setWindows] = useState<CaptureWindowCandidate[]>([])
  const [selectedWindowId, setSelectedWindowId] = useState('')
  const [preview, setPreview] = useState<BuffCapturePreview | null>(null)
  const [selection, setSelection] = useState<VisualWorkflowSelection>({
    kind: 'step',
    id: initialDefinition.root.id
  })
  const [busyAction, setBusyAction] = useState<VisualWorkflowController['busyAction']>(null)
  const [error, setError] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const dirtyRef = useRef(false)
  const latestRunIdRef = useRef(0)

  const setDraft = useCallback(
    (updater: (current: VisualWorkflowDefinition) => VisualWorkflowDefinition) => {
      dirtyRef.current = true
      setIsDirty(true)
      setDiagnostics([])
      setDraftState(updater)
    },
    []
  )

  const applyState = useCallback((nextState: VisualWorkflowState, preserveDraft = false): void => {
    if (nextState.runId < latestRunIdRef.current) return
    latestRunIdRef.current = nextState.runId
    setState(nextState)
    setDiagnostics(nextState.diagnostics)
    if (!preserveDraft || !dirtyRef.current) {
      dirtyRef.current = false
      setIsDirty(false)
      setDraftState(nextState.definition)
      setSelection((current) =>
        selectionExists(nextState.definition, current)
          ? current
          : { kind: 'step', id: nextState.definition.root.id }
      )
    }
  }, [])

  useEffect(() => {
    let disposed = false
    const stopState = window.api.onVisualWorkflowState((nextState) => {
      if (!disposed) applyState(nextState, true)
    })
    const stopProgress = window.api.onVisualWorkflowProgress((progress) => {
      if (!disposed && progress.runId === latestRunIdRef.current) {
        setState((current) =>
          current.isRunning && current.runId === progress.runId
            ? { ...current, ...progress }
            : current
        )
      }
    })
    const stopLog = window.api.onVisualWorkflowExecutionLog((message) => {
      if (!disposed) setLogs((current) => [...current.slice(-299), message])
    })

    void window.api
      .getVisualWorkflowState()
      .then((nextState) => {
        if (!disposed) applyState(nextState)
      })
      .catch((reason: unknown) => {
        if (!disposed) setError(`读取视觉流程失败：${messageFromError(reason)}`)
      })

    return () => {
      disposed = true
      stopState()
      stopProgress()
      stopLog()
    }
  }, [applyState])

  const selectedStep = useMemo(
    () => (selection.kind === 'step' ? findVisualWorkflowStep(draft.root, selection.id) : null),
    [draft.root, selection]
  )
  const runtimeActive = !['idle', 'completed', 'error'].includes(state.activity)
  const isLocked = state.isRunning || runtimeActive || busyAction !== null
  const hasErrors = diagnostics.some((item) => item.severity === 'error')

  const updateDefinition = useCallback(
    (patch: Partial<Pick<VisualWorkflowDefinition, 'name' | 'description'>>) => {
      if (isLocked) return
      setDraft((current) => ({ ...current, ...patch }))
    },
    [isLocked, setDraft]
  )

  const updateStep = useCallback(
    (id: string, updater: (current: VisualWorkflowStep) => VisualWorkflowStep) => {
      if (isLocked) return
      setDraft((current) => ({
        ...current,
        root: updateNestedStep(current.root, id, updater)
      }))
    },
    [isLocked, setDraft]
  )

  const addStep = useCallback(
    (type: VisualWorkflowStepType) => {
      if (isLocked) return
      const nextStep = createStep(type, draft)
      const selectedId = selection.kind === 'step' ? selection.id : draft.root.id
      setDraft((current) => {
        const [root, inserted] = insertStep(current.root, selectedId, nextStep)
        const fallbackRoot =
          !inserted && current.root.type === 'sequence'
            ? { ...current.root, steps: [...current.root.steps, nextStep] }
            : root
        return { ...current, root: fallbackRoot }
      })
      setSelection({ kind: 'step', id: nextStep.id })
    },
    [draft, isLocked, selection, setDraft]
  )

  const removeStep = useCallback(
    (id: string) => {
      if (isLocked || id === draft.root.id) return
      setDraft((current) => ({ ...current, root: removeNestedStep(current.root, id) }))
      setSelection({ kind: 'step', id: draft.root.id })
    },
    [draft.root.id, isLocked, setDraft]
  )

  const moveStep = useCallback(
    (id: string, direction: 'up' | 'down') => {
      if (isLocked) return
      setDraft((current) => ({
        ...current,
        root: moveNestedStep(current.root, id, direction)
      }))
    },
    [isLocked, setDraft]
  )

  const canMoveStep = useCallback(
    (id: string, direction: 'up' | 'down') => canMoveNestedStep(draft.root, id, direction),
    [draft.root]
  )

  const addPoint = useCallback(() => {
    if (isLocked) return
    const point: VisualWorkflowPointResource = {
      id: createId('point'),
      name: `点位 ${draft.resources.points.length + 1}`,
      location: { mode: 'windowRelative', x: 0.5, y: 0.5 }
    }
    setDraft((current) => ({
      ...current,
      resources: { ...current.resources, points: [...current.resources.points, point] }
    }))
    setSelection({ kind: 'point', id: point.id })
  }, [draft.resources.points.length, isLocked, setDraft])

  const updatePoint = useCallback(
    (id: string, patch: Partial<VisualWorkflowPointResource>) => {
      if (isLocked) return
      setDraft((current) => ({
        ...current,
        resources: {
          ...current.resources,
          points: current.resources.points.map((point) =>
            point.id === id ? { ...point, ...patch } : point
          )
        }
      }))
    },
    [isLocked, setDraft]
  )

  const removePoint = useCallback(
    (id: string) => {
      if (isLocked) return
      setDraft((current) => ({
        ...current,
        resources: {
          ...current.resources,
          points: current.resources.points.filter((point) => point.id !== id)
        }
      }))
      setSelection({ kind: 'step', id: draft.root.id })
    },
    [draft.root.id, isLocked, setDraft]
  )

  const addDetector = useCallback(() => {
    if (isLocked) return
    const detector: VisualWorkflowDetectorResource = {
      id: createId('detector'),
      name: `识别器 ${draft.resources.detectors.length + 1}`,
      searchRegion: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      template: {
        assetId: '',
        width: 0,
        height: 0,
        captureReferenceWidth: 0,
        captureReferenceHeight: 0
      },
      matchThreshold: 0.95,
      confirmFrames: 2,
      missingFrames: 3,
      staleAfterMs: 500
    }
    setDraft((current) => ({
      ...current,
      resources: {
        ...current.resources,
        detectors: [...current.resources.detectors, detector]
      }
    }))
    setSelection({ kind: 'detector', id: detector.id })
  }, [draft.resources.detectors.length, isLocked, setDraft])

  const updateDetector = useCallback(
    (id: string, patch: Partial<VisualWorkflowDetectorResource>) => {
      if (isLocked) return
      setDraft((current) => ({
        ...current,
        resources: {
          ...current.resources,
          detectors: current.resources.detectors.map((detector) =>
            detector.id === id ? { ...detector, ...patch } : detector
          )
        }
      }))
    },
    [isLocked, setDraft]
  )

  const removeDetector = useCallback(
    (id: string) => {
      if (isLocked) return
      setDraft((current) => ({
        ...current,
        resources: {
          ...current.resources,
          detectors: current.resources.detectors.filter((detector) => detector.id !== id)
        }
      }))
      setSelection({ kind: 'step', id: draft.root.id })
    },
    [draft.root.id, isLocked, setDraft]
  )

  const updateParameter = useCallback(
    (id: string, patch: Partial<VisualWorkflowNumberParameter>) => {
      if (isLocked) return
      setDraft((current) => ({
        ...current,
        resources: {
          ...current.resources,
          parameters: current.resources.parameters.map((parameter) =>
            parameter.id === id ? { ...parameter, ...patch } : parameter
          )
        }
      }))
    },
    [isLocked, setDraft]
  )

  const addParameter = useCallback(() => {
    if (isLocked) return
    const parameter: VisualWorkflowNumberParameter = {
      id: createId('parameter'),
      name: `数值参数 ${draft.resources.parameters.length + 1}`,
      defaultValue: 1,
      minValue: 0,
      maxValue: 100_000
    }
    setDraft((current) => ({
      ...current,
      resources: {
        ...current.resources,
        parameters: [...current.resources.parameters, parameter]
      }
    }))
  }, [draft.resources.parameters.length, isLocked, setDraft])

  const removeParameter = useCallback(
    (id: string) => {
      if (isLocked) return
      const parameter = draft.resources.parameters.find((item) => item.id === id)
      const references = countVisualWorkflowResourceReferences(draft, 'parameter', id)
      if (
        references > 0 &&
        !window.confirm(
          `数值参数“${parameter?.name ?? id}”仍被 ${references} 处步骤引用。删除后流程将无法通过校验，是否继续？`
        )
      ) {
        return
      }
      setDraft((current) => ({
        ...current,
        resources: {
          ...current.resources,
          parameters: current.resources.parameters.filter((parameter) => parameter.id !== id)
        }
      }))
    },
    [draft, isLocked, setDraft]
  )

  const updateCounter = useCallback(
    (id: string, patch: Partial<VisualWorkflowCounterResource>) => {
      if (isLocked) return
      setDraft((current) => ({
        ...current,
        resources: {
          ...current.resources,
          counters: current.resources.counters.map((counter) =>
            counter.id === id ? { ...counter, ...patch } : counter
          )
        }
      }))
    },
    [isLocked, setDraft]
  )

  const addCounter = useCallback(() => {
    if (isLocked) return
    const counter: VisualWorkflowCounterResource = {
      id: createId('counter'),
      name: `运行计数器 ${draft.resources.counters.length + 1}`,
      initialValue: 0
    }
    setDraft((current) => ({
      ...current,
      resources: {
        ...current.resources,
        counters: [...current.resources.counters, counter]
      }
    }))
  }, [draft.resources.counters.length, isLocked, setDraft])

  const removeCounter = useCallback(
    (id: string) => {
      if (isLocked) return
      const counter = draft.resources.counters.find((item) => item.id === id)
      const references = countVisualWorkflowResourceReferences(draft, 'counter', id)
      if (
        references > 0 &&
        !window.confirm(
          `运行计数器“${counter?.name ?? id}”仍被 ${references} 处步骤引用。删除后流程将无法通过校验，是否继续？`
        )
      ) {
        return
      }
      setDraft((current) => ({
        ...current,
        resources: {
          ...current.resources,
          counters: current.resources.counters.filter((counter) => counter.id !== id)
        }
      }))
    },
    [draft, isLocked, setDraft]
  )

  const addSafetyGuard = useCallback(() => {
    if (isLocked) return
    setDraft((current) => ({
      ...current,
      safetyGuards: [
        ...current.safetyGuards,
        {
          condition: { type: 'targetState', state: 'exists', expected: false },
          message: '目标窗口不可用，流程已停止'
        }
      ]
    }))
  }, [isLocked, setDraft])

  const updateSafetyGuard = useCallback(
    (index: number, patch: Partial<VisualWorkflowDefinition['safetyGuards'][number]>): void => {
      if (isLocked) return
      setDraft((current) => ({
        ...current,
        safetyGuards: current.safetyGuards.map((guard, guardIndex) =>
          guardIndex === index ? { ...guard, ...patch } : guard
        )
      }))
    },
    [isLocked, setDraft]
  )

  const removeSafetyGuard = useCallback(
    (index: number): void => {
      if (isLocked) return
      setDraft((current) => ({
        ...current,
        safetyGuards: current.safetyGuards.filter((_, guardIndex) => guardIndex !== index)
      }))
    },
    [isLocked, setDraft]
  )

  const loadPurchaseExample = useCallback(() => {
    if (isLocked) return
    const confirmed = window.confirm('载入抢购示例会覆盖当前未保存的视觉流程草稿，是否继续？')
    if (!confirmed) return

    const example = createPurchaseExampleVisualWorkflowDefinition()
    dirtyRef.current = true
    setIsDirty(true)
    setError(null)
    setDraftState(example)
    setDiagnostics(createPurchaseExampleDiagnostics(example))
    setSelection({ kind: 'step', id: example.root.id })
  }, [isLocked])

  const runAction = useCallback(
    async <T>(
      action: NonNullable<VisualWorkflowController['busyAction']>,
      operation: () => Promise<T>
    ): Promise<T | undefined> => {
      setBusyAction(action)
      setError(null)
      try {
        return await operation()
      } catch (reason) {
        setError(messageFromError(reason))
        return undefined
      } finally {
        setBusyAction(null)
      }
    },
    []
  )

  const save = useCallback(async (): Promise<void> => {
    if (isLocked) return
    const nextState = await runAction('save', () => window.api.saveVisualWorkflow(draft))
    if (!nextState) return
    applyState(nextState)
  }, [applyState, draft, isLocked, runAction])

  const refreshWindows = useCallback(async (): Promise<void> => {
    if (isLocked) return
    const result = await runAction('windows', () => window.api.listVisualWorkflowCaptureWindows())
    if (!result) return
    setWindows(result)
    setSelectedWindowId((current) =>
      result.some((candidate) => candidate.id === current) ? current : (result[0]?.id ?? '')
    )
  }, [isLocked, runAction])

  const capturePreview = useCallback(async (): Promise<void> => {
    if (isLocked) return
    if (!selectedWindowId) {
      setError('请先刷新并选择一个目标窗口')
      return
    }
    const result = await runAction('preview', () =>
      window.api.captureVisualWorkflowPreview(selectedWindowId)
    )
    if (!result) return
    setPreview(result)
    dirtyRef.current = true
    setIsDirty(true)
    setDraftState((current) => ({ ...current, target: result.target }))
    setDiagnostics((current) =>
      current.filter(
        (diagnostic) =>
          diagnostic.code !== 'targetPendingCapture' && diagnostic.code !== 'missingTarget'
      )
    )
  }, [isLocked, runAction, selectedWindowId])

  const setPointFromPreview = useCallback(
    (id: string, x: number, y: number): void => {
      updatePoint(id, {
        location: {
          mode: 'windowRelative',
          x: Math.min(1, Math.max(0, x)),
          y: Math.min(1, Math.max(0, y))
        }
      })
    },
    [updatePoint]
  )

  const saveDetectorTemplate = useCallback(
    async (
      id: string,
      crop: NormalizedRect = { x: 0, y: 0, width: 1, height: 1 }
    ): Promise<void> => {
      if (isLocked) return
      if (!preview) {
        setError('请先捕获目标窗口预览')
        return
      }
      const detector = draft.resources.detectors.find((item) => item.id === id)
      if (!detector) {
        setError('找不到要采集模板的识别器')
        return
      }
      const nextState = await runAction('saveTemplate', () =>
        window.api.saveVisualWorkflowDetectorTemplate(draft, id, detector.searchRegion, crop)
      )
      if (!nextState) return
      applyState(nextState)
      setSelection({ kind: 'detector', id })
    },
    [applyState, draft, isLocked, preview, runAction]
  )

  const deleteDetectorTemplate = useCallback(
    async (id: string): Promise<void> => {
      if (isLocked) return
      const nextState = await runAction('deleteTemplate', () =>
        window.api.deleteVisualWorkflowDetectorTemplate(draft, id)
      )
      if (!nextState) return
      applyState(nextState)
      setSelection({ kind: 'detector', id })
    },
    [applyState, draft, isLocked, runAction]
  )

  const validate = useCallback(async (): Promise<VisualWorkflowDiagnostic[]> => {
    if (state.isRunning) return diagnostics
    const result = await runAction('validate', () => window.api.validateVisualWorkflow(draft))
    if (!result) return diagnostics
    setDiagnostics(result)
    return result
  }, [diagnostics, draft, runAction, state.isRunning])

  const start = useCallback(async (): Promise<void> => {
    if (isLocked) return
    const nextState = await runAction('start', () => window.api.startVisualWorkflow(draft))
    if (!nextState) return
    applyState(nextState)
  }, [applyState, draft, isLocked, runAction])

  const stop = useCallback(async (): Promise<void> => {
    const stoppable =
      state.isRunning || ['countdown', 'running', 'waiting', 'testing'].includes(state.activity)
    if (!stoppable || busyAction) return
    const nextState = await runAction('stop', () => window.api.stopVisualWorkflow())
    if (!nextState) return
    applyState(nextState, true)
  }, [applyState, busyAction, runAction, state.activity, state.isRunning])

  return {
    state,
    draft,
    diagnostics,
    logs,
    selection,
    selectedStep,
    windows,
    selectedWindowId,
    preview,
    busyAction,
    error,
    isDirty,
    isLocked,
    hasErrors,
    setSelection,
    setSelectedWindowId,
    updateDefinition,
    updateStep,
    addStep,
    removeStep,
    moveStep,
    canMoveStep,
    addPoint,
    updatePoint,
    removePoint,
    addDetector,
    updateDetector,
    removeDetector,
    addParameter,
    updateParameter,
    removeParameter,
    addCounter,
    updateCounter,
    removeCounter,
    addSafetyGuard,
    updateSafetyGuard,
    removeSafetyGuard,
    loadPurchaseExample,
    refreshWindows,
    capturePreview,
    setPointFromPreview,
    saveDetectorTemplate,
    deleteDetectorTemplate,
    save,
    validate,
    start,
    stop,
    clearLogs: () => setLogs([])
  }
}
