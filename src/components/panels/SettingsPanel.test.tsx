import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MacroSettings } from '@/lib/macro-api'
import {
  createMacroApi,
  createMacroController,
  installMacroApi,
  renderWithUiProviders
} from '@/test/test-utils'

import { SettingsPanel } from './SettingsPanel'

function settingsWith(patch: Partial<MacroSettings> = {}): MacroSettings {
  return {
    clickIntervalSeconds: 0.5,
    loopIntervalSeconds: 1,
    startDelaySeconds: 1,
    loopMode: 'count',
    loopCount: 7,
    hotkeys: {
      capture: 'CommandOrControl+Alt+Q',
      start: 'CommandOrControl+Alt+P',
      stop: 'CommandOrControl+Alt+O'
    },
    ...patch
  }
}

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses an accessible non-empty RadioGroup and updates the loop mode from the keyboard', async () => {
    const user = userEvent.setup()
    const controller = createMacroController({ draftSettings: settingsWith() })
    renderWithUiProviders(<SettingsPanel controller={controller} />)

    const countMode = screen.getByRole('radio', { name: '指定次数' })
    const infiniteMode = screen.getByRole('radio', { name: '无限循环' })

    expect(countMode).toBeChecked()
    expect(infiniteMode).not.toBeChecked()
    expect(
      screen.getAllByRole('radio').filter((radio) => radio.getAttribute('aria-checked') === 'true')
    ).toHaveLength(1)

    infiniteMode.focus()
    await user.keyboard(' ')

    expect(controller.setDraftSettings).toHaveBeenCalledTimes(1)
    const update = vi.mocked(controller.setDraftSettings).mock.calls[0][0]
    expect(typeof update).toBe('function')
    const nextSettings = (update as (current: MacroSettings) => MacroSettings)(
      controller.draftSettings
    )
    expect(nextSettings.loopMode).toBe('infinite')
  })

  it('disables the loop count for infinite mode without discarding its draft value', () => {
    const infiniteController = createMacroController({
      draftSettings: settingsWith({ loopMode: 'infinite', loopCount: 7 })
    })
    const { rerender } = renderWithUiProviders(<SettingsPanel controller={infiniteController} />)

    const loopCount = screen.getByLabelText('循环次数')
    expect(loopCount).toBeDisabled()
    expect(loopCount).toHaveValue(7)

    const countController = createMacroController({
      draftSettings: settingsWith({ loopMode: 'count', loopCount: 7 })
    })
    rerender(<SettingsPanel controller={countController} />)

    expect(screen.getByLabelText('循环次数')).toBeEnabled()
    expect(screen.getByLabelText('循环次数')).toHaveValue(7)
  })

  it('locks editable controls while recording or running', () => {
    const controller = createMacroController({
      draftSettings: settingsWith(),
      isEditingLocked: true
    })
    renderWithUiProviders(<SettingsPanel controller={controller} />)

    expect(screen.getByRole('radio', { name: '指定次数' })).toBeDisabled()
    expect(screen.getByRole('radio', { name: '无限循环' })).toBeDisabled()
    expect(screen.getByLabelText('默认点击间隔 s')).toBeDisabled()
    expect(screen.getByLabelText('采集坐标快捷键')).toBeDisabled()
    expect(screen.getByRole('button', { name: /保存配置/ })).toBeDisabled()
  })

  it('preserves hotkey focus, keydown and blur capture callbacks', () => {
    const controller = createMacroController({ draftSettings: settingsWith() })
    renderWithUiProviders(<SettingsPanel controller={controller} />)

    const captureInput = screen.getByLabelText('采集坐标快捷键')
    fireEvent.focus(captureInput)
    expect(controller.startHotkeyCapture).toHaveBeenCalledWith('capture')

    fireEvent.keyDown(captureInput, { altKey: true, ctrlKey: true, key: 'k' })
    expect(controller.captureHotkey).toHaveBeenCalledWith(
      expect.objectContaining({ altKey: true, ctrlKey: true, key: 'k' }),
      'capture'
    )

    fireEvent.blur(captureInput)
    expect(controller.stopHotkeyCapture).toHaveBeenCalledTimes(1)
  })

  it('saves the current settings through the controller state updater', async () => {
    const user = userEvent.setup()
    const controller = createMacroController({ draftSettings: settingsWith() })
    const api = createMacroApi(controller.state)
    installMacroApi(api)
    renderWithUiProviders(<SettingsPanel controller={controller} />)

    await user.click(screen.getByRole('button', { name: /保存配置/ }))

    expect(api.updateSettings).toHaveBeenCalledWith(controller.draftSettings)
    expect(controller.updateState).toHaveBeenCalledTimes(1)
  })
})
