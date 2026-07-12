import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MacroPoint } from '@/lib/macro-api'
import {
  createMacroApi,
  createMacroController,
  createMacroState,
  installMacroApi,
  renderWithUiProviders
} from '@/test/test-utils'

import { ControlPanel } from './ControlPanel'

const point: MacroPoint = {
  id: 'point-1',
  label: '步骤一',
  action: 'click',
  enabled: true,
  x: 100,
  y: 200,
  key: '',
  modifiers: [],
  delaySeconds: 0.5,
  createdAt: 1
}

type ButtonState = {
  record: boolean
  stopRecording: boolean
  run: boolean
  stopRun: boolean
}

function expectButtonState(expected: ButtonState): void {
  const assertions: Array<[HTMLElement, boolean]> = [
    [screen.getByRole('button', { name: '录制' }), expected.record],
    [screen.getByRole('button', { name: '停止录制' }), expected.stopRecording],
    [screen.getByRole('button', { name: '执行' }), expected.run],
    [screen.getByRole('button', { name: '停止执行' }), expected.stopRun]
  ]

  for (const [button, enabled] of assertions) {
    if (enabled) expect(button).toBeEnabled()
    else expect(button).toBeDisabled()
  }
}

describe('ControlPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it.each([
    {
      name: 'idle without steps',
      controller: createMacroController(),
      expected: { record: true, stopRecording: false, run: false, stopRun: false }
    },
    {
      name: 'idle with partially enabled steps',
      controller: createMacroController({
        state: createMacroState({
          points: [
            { ...point, enabled: false },
            { ...point, id: 'point-2' }
          ]
        })
      }),
      expected: { record: true, stopRecording: false, run: true, stopRun: false }
    },
    {
      name: 'idle with all steps disabled',
      controller: createMacroController({
        state: createMacroState({ points: [{ ...point, enabled: false }] })
      }),
      expected: { record: true, stopRecording: false, run: false, stopRun: false }
    },
    {
      name: 'recording',
      controller: createMacroController({
        state: createMacroState({ isRecording: true, points: [point] }),
        isEditingLocked: true,
        canStopRecording: true,
        status: { label: '录制中', tone: 'warning' }
      }),
      expected: { record: false, stopRecording: true, run: false, stopRun: false }
    },
    {
      name: 'running',
      controller: createMacroController({
        state: createMacroState({ isRunning: true, points: [point] }),
        isEditingLocked: true,
        canStopRecording: false,
        status: { label: '执行中', tone: 'success' }
      }),
      expected: { record: false, stopRecording: false, run: false, stopRun: true }
    }
  ])('applies the control button state matrix while $name', ({ controller, expected }) => {
    renderWithUiProviders(<ControlPanel controller={controller} />)

    expectButtonState(expected)
    if (controller.state.isRecording) {
      expect(screen.getByText('采集中')).toHaveAttribute('aria-live', 'polite')
    }
  })

  it('routes each enabled control action through the API and state updater', async () => {
    const user = userEvent.setup()
    const idleController = createMacroController({
      state: createMacroState({ points: [point] })
    })
    const api = createMacroApi(idleController.state)
    installMacroApi(api)
    const { rerender } = renderWithUiProviders(<ControlPanel controller={idleController} />)

    await user.click(screen.getByRole('button', { name: '录制' }))
    await user.click(screen.getByRole('button', { name: '执行' }))

    const recordingController = createMacroController({
      state: createMacroState({ isRecording: true, points: [point] }),
      isEditingLocked: true,
      canStopRecording: true
    })
    rerender(<ControlPanel controller={recordingController} />)
    await user.click(screen.getByRole('button', { name: '停止录制' }))

    const runningController = createMacroController({
      state: createMacroState({ isRunning: true, points: [point] }),
      isEditingLocked: true
    })
    rerender(<ControlPanel controller={runningController} />)
    await user.click(screen.getByRole('button', { name: '停止执行' }))

    expect(api.startRecording).toHaveBeenCalledTimes(1)
    expect(api.startRun).toHaveBeenCalledTimes(1)
    expect(api.stopRecording).toHaveBeenCalledTimes(1)
    expect(api.stopRun).toHaveBeenCalledTimes(1)
    expect(idleController.updateState).toHaveBeenCalledTimes(2)
    expect(recordingController.updateState).toHaveBeenCalledTimes(1)
    expect(runningController.updateState).toHaveBeenCalledTimes(1)
  })
})
