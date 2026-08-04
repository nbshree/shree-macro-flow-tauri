import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import {
  countVisualWorkflowResourceReferences,
  createPurchaseExampleVisualWorkflowDefinition,
  type VisualWorkflowController
} from '../../hooks/useVisualWorkflowController'
import type {
  VisualWorkflowDefinition,
  VisualWorkflowState,
  VisualWorkflowStep
} from '../../lib/macro-api'
import { VisualWorkflowPage } from './VisualWorkflowPage'

const clickStep: Extract<VisualWorkflowStep, { type: 'click' }> = {
  id: 'step-click',
  label: '点击商品',
  enabled: true,
  type: 'click',
  pointId: 'point-result',
  button: 'left',
  clickCount: 1
}

const delayStep: Extract<VisualWorkflowStep, { type: 'delay' }> = {
  id: 'step-delay',
  label: '等待刷新',
  enabled: true,
  type: 'delay',
  durationMs: { type: 'literal', value: 50 }
}

const definition: VisualWorkflowDefinition = {
  schemaVersion: 1,
  id: 'workflow-trade',
  name: '交易行循环',
  description: '识别购买按钮并循环点击',
  target: {
    processName: 'game.exe',
    windowTitle: '目标窗口',
    className: 'GameWindow',
    referenceWidth: 1_920,
    referenceHeight: 1_080
  },
  resources: {
    points: [
      {
        id: 'point-result',
        name: '搜索结果',
        location: { mode: 'windowRelative', x: 0.4, y: 0.5 }
      },
      {
        id: 'point-buy',
        name: '购买按钮',
        location: { mode: 'windowRelative', x: 0.8, y: 0.82 }
      }
    ],
    detectors: [
      {
        id: 'detector-buy',
        name: '购买图标',
        searchRegion: { x: 0.5, y: 0.5, width: 0.4, height: 0.4 },
        template: {
          assetId: 'buy-template',
          width: 32,
          height: 24,
          captureReferenceWidth: 1_920,
          captureReferenceHeight: 1_080
        },
        matchThreshold: 0.95,
        confirmFrames: 2,
        missingFrames: 3,
        staleAfterMs: 500
      }
    ],
    parameters: [],
    counters: []
  },
  safetyGuards: [],
  root: {
    id: 'root',
    label: '主流程',
    enabled: true,
    type: 'sequence',
    steps: [clickStep, delayStep]
  }
}

const idleState: VisualWorkflowState = {
  runId: 0,
  definition,
  activity: 'idle',
  isRunning: false,
  countdownRemaining: 0,
  currentStepId: null,
  diagnostics: [],
  lastError: null
}

function createController(
  overrides: Partial<VisualWorkflowController> = {}
): VisualWorkflowController {
  const updateStep = vi.fn<VisualWorkflowController['updateStep']>()
  return {
    state: idleState,
    draft: definition,
    diagnostics: [],
    logs: [],
    selection: { kind: 'step', id: clickStep.id },
    selectedStep: clickStep,
    windows: [],
    selectedWindowId: '',
    preview: null,
    busyAction: null,
    error: null,
    isDirty: true,
    isLocked: false,
    hasErrors: false,
    setSelection: vi.fn<VisualWorkflowController['setSelection']>(),
    setSelectedWindowId: vi.fn<VisualWorkflowController['setSelectedWindowId']>(),
    updateDefinition: vi.fn<VisualWorkflowController['updateDefinition']>(),
    updateStep,
    addStep: vi.fn<VisualWorkflowController['addStep']>(),
    removeStep: vi.fn<VisualWorkflowController['removeStep']>(),
    moveStep: vi.fn<VisualWorkflowController['moveStep']>(),
    canMoveStep: vi.fn<VisualWorkflowController['canMoveStep']>((id, direction) => {
      if (id === clickStep.id) return direction === 'down'
      if (id === delayStep.id) return direction === 'up'
      return false
    }),
    addPoint: vi.fn<VisualWorkflowController['addPoint']>(),
    updatePoint: vi.fn<VisualWorkflowController['updatePoint']>(),
    removePoint: vi.fn<VisualWorkflowController['removePoint']>(),
    addDetector: vi.fn<VisualWorkflowController['addDetector']>(),
    updateDetector: vi.fn<VisualWorkflowController['updateDetector']>(),
    removeDetector: vi.fn<VisualWorkflowController['removeDetector']>(),
    addParameter: vi.fn<VisualWorkflowController['addParameter']>(),
    updateParameter: vi.fn<VisualWorkflowController['updateParameter']>(),
    removeParameter: vi.fn<VisualWorkflowController['removeParameter']>(),
    addCounter: vi.fn<VisualWorkflowController['addCounter']>(),
    updateCounter: vi.fn<VisualWorkflowController['updateCounter']>(),
    removeCounter: vi.fn<VisualWorkflowController['removeCounter']>(),
    addSafetyGuard: vi.fn<VisualWorkflowController['addSafetyGuard']>(),
    updateSafetyGuard: vi.fn<VisualWorkflowController['updateSafetyGuard']>(),
    removeSafetyGuard: vi.fn<VisualWorkflowController['removeSafetyGuard']>(),
    loadPurchaseExample: vi.fn<VisualWorkflowController['loadPurchaseExample']>(),
    refreshWindows: vi
      .fn<VisualWorkflowController['refreshWindows']>()
      .mockResolvedValue(undefined),
    capturePreview: vi
      .fn<VisualWorkflowController['capturePreview']>()
      .mockResolvedValue(undefined),
    setPointFromPreview: vi.fn<VisualWorkflowController['setPointFromPreview']>(),
    saveDetectorTemplate: vi
      .fn<VisualWorkflowController['saveDetectorTemplate']>()
      .mockResolvedValue(undefined),
    deleteDetectorTemplate: vi
      .fn<VisualWorkflowController['deleteDetectorTemplate']>()
      .mockResolvedValue(undefined),
    save: vi.fn<VisualWorkflowController['save']>().mockResolvedValue(undefined),
    validate: vi.fn<VisualWorkflowController['validate']>().mockResolvedValue([]),
    start: vi.fn<VisualWorkflowController['start']>().mockResolvedValue(undefined),
    stop: vi.fn<VisualWorkflowController['stop']>().mockResolvedValue(undefined),
    clearLogs: vi.fn<VisualWorkflowController['clearLogs']>(),
    ...overrides
  }
}

describe('VisualWorkflowPage', () => {
  it('renders natural language steps and exposes keyboard-friendly editing actions', async () => {
    const user = userEvent.setup()
    const controller = createController()
    render(<VisualWorkflowPage controller={controller} />)

    expect(screen.getByText('左键单击“搜索结果”')).toBeInTheDocument()
    expect(screen.getByText('等待 50 ms')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择点位 搜索结果' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择识别器 购买图标' })).toBeInTheDocument()

    await user.click(screen.getByRole('combobox', { name: '点击点位' }))
    await user.click(await screen.findByRole('option', { name: '购买按钮' }))

    expect(controller.updateStep).toHaveBeenCalledTimes(1)
    const updater = vi.mocked(controller.updateStep).mock.calls[0][1]
    expect(updater(clickStep)).toMatchObject({ pointId: 'point-buy' })

    await user.click(screen.getByRole('button', { name: '添加步骤' }))
    expect(controller.addStep).toHaveBeenCalledWith('click')

    await user.click(screen.getByRole('button', { name: '下移步骤 点击商品' }))
    expect(controller.moveStep).toHaveBeenCalledWith(clickStep.id, 'down')
  })

  it('locks all editing controls and highlights the current step while running', () => {
    const runningState: VisualWorkflowState = {
      ...idleState,
      activity: 'running',
      isRunning: true,
      currentStepId: clickStep.id
    }
    const controller = createController({
      state: runningState,
      isDirty: false,
      isLocked: true
    })
    render(<VisualWorkflowPage controller={controller} />)

    expect(screen.getByRole('button', { name: '停止' })).toBeEnabled()
    expect(screen.getByRole('combobox', { name: '新步骤类型' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: '步骤名称' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '载入抢购示例' })).toBeDisabled()
    expect(screen.getByText('正在执行')).toBeInTheDocument()
  })

  it('offers the bounded purchase example from the toolbar', async () => {
    const user = userEvent.setup()
    const controller = createController()
    render(<VisualWorkflowPage controller={controller} />)

    await user.click(screen.getByRole('button', { name: '载入抢购示例' }))

    expect(controller.loadPurchaseExample).toHaveBeenCalledTimes(1)
  })

  it('captures the selected detector from a window preview', async () => {
    const user = userEvent.setup()
    const controller = createController({
      selection: { kind: 'detector', id: 'detector-buy' },
      windows: [
        {
          id: 'window-1',
          processName: 'game.exe',
          windowTitle: '目标窗口',
          className: 'GameWindow',
          width: 1_920,
          height: 1_080
        }
      ],
      selectedWindowId: 'window-1',
      preview: {
        dataUrl: 'data:image/png;base64,AA==',
        width: 1_920,
        height: 1_080,
        target: {
          processName: 'game.exe',
          windowTitle: '目标窗口',
          className: 'GameWindow',
          referenceWidth: 1_920,
          referenceHeight: 1_080
        }
      }
    })
    render(<VisualWorkflowPage controller={controller} />)

    await user.click(screen.getByRole('button', { name: '将选区采集为模板' }))

    expect(controller.saveDetectorTemplate).toHaveBeenCalledWith('detector-buy')
  })

  it('presents point placement as a pointer canvas with an explicit keyboard alternative', () => {
    const controller = createController({
      selection: { kind: 'point', id: 'point-result' },
      preview: {
        dataUrl: 'data:image/png;base64,AA==',
        width: 1_920,
        height: 1_080,
        target: definition.target!
      }
    })
    render(<VisualWorkflowPage controller={controller} />)

    expect(
      screen.queryByRole('button', { name: '在窗口预览中设置点位 搜索结果' })
    ).not.toBeInTheDocument()
    expect(screen.getByText(/键盘请使用右侧 X\/Y 输入/)).toBeInTheDocument()
  })

  it('can add parameters, counters, guards and counter steps from an empty editor', async () => {
    const user = userEvent.setup()
    const controller = createController()
    render(<VisualWorkflowPage controller={controller} />)

    await user.click(screen.getByRole('button', { name: '添加数值参数' }))
    await user.click(screen.getByRole('button', { name: '添加运行计数器' }))
    await user.click(screen.getByRole('button', { name: '添加全局安全保护' }))
    expect(controller.addParameter).toHaveBeenCalledTimes(1)
    expect(controller.addCounter).toHaveBeenCalledTimes(1)
    expect(controller.addSafetyGuard).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('combobox', { name: '新步骤类型' }))
    await user.click(await screen.findByRole('option', { name: '增加计数器' }))
    await user.click(screen.getByRole('button', { name: '添加步骤' }))
    expect(controller.addStep).toHaveBeenLastCalledWith('counterAdd')
  })

  it('normalizes parameter and counter inputs to safe integers', () => {
    const resourceDefinition: VisualWorkflowDefinition = {
      ...definition,
      resources: {
        ...definition.resources,
        parameters: [
          {
            id: 'parameter-count',
            name: '次数',
            defaultValue: 2,
            minValue: 0,
            maxValue: 10
          }
        ],
        counters: [{ id: 'counter-attempts', name: '尝试', initialValue: 0 }]
      }
    }
    const controller = createController({ draft: resourceDefinition })
    render(<VisualWorkflowPage controller={controller} />)

    fireEvent.change(screen.getByLabelText('默认值'), { target: { value: '1.5' } })
    fireEvent.change(screen.getByLabelText('初始值'), { target: { value: '3.8' } })

    expect(controller.updateParameter).toHaveBeenCalledWith('parameter-count', {
      defaultValue: 1
    })
    expect(controller.updateCounter).toHaveBeenCalledWith('counter-attempts', {
      initialValue: 3
    })
  })

  it('builds a structured example without claiming a completed purchase', () => {
    const example = createPurchaseExampleVisualWorkflowDefinition()
    const serialized = JSON.stringify(example)

    expect(example.resources.points).toHaveLength(3)
    expect(example.resources.detectors).toHaveLength(2)
    expect(example.resources.detectors.every((detector) => detector.template.assetId === '')).toBe(
      true
    )
    expect(example.resources.counters).toEqual([
      expect.objectContaining({ id: 'purchase-attempts', initialValue: 0 })
    ])
    expect(serialized).toContain('repeatUntil')
    expect(serialized).toContain('waitUntil')
    expect(serialized).toContain('counterAdd')
    expect(serialized).toContain('购买点击尝试')
    expect(serialized).not.toContain('购买成功')
    expect(serialized).not.toContain('成交成功')
    expect(countVisualWorkflowResourceReferences(example, 'parameter', 'purchase-count')).toBe(2)
    expect(countVisualWorkflowResourceReferences(example, 'counter', 'purchase-attempts')).toBe(2)
  })
})
