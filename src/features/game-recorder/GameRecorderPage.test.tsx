import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { GameRecordingSummary } from '@/lib/macro-api'
import {
  createGameRecorderController,
  createGameRecorderState,
  renderWithUiProviders
} from '@/test/test-utils'

import { GameRecorderPage } from './GameRecorderPage'

function createRecording(overrides: Partial<GameRecordingSummary> = {}): GameRecordingSummary {
  return {
    id: 'recording-1',
    name: '镜头转向与闪避',
    durationMs: 12_500,
    eventCount: 320,
    keyboardEventCount: 48,
    mouseEventCount: 272,
    target: {
      processName: 'game.exe',
      windowTitle: '测试游戏'
    },
    createdAt: new Date('2026-07-22T10:00:00+08:00').getTime(),
    updatedAt: new Date('2026-07-22T10:01:00+08:00').getTime(),
    playback: {
      speed: 1,
      loopMode: 'count',
      loopCount: 3,
      loopIntervalSeconds: 1
    },
    ...overrides
  }
}

describe('GameRecorderPage', () => {
  it('shows a guided empty state and only enables starting a recording while idle', () => {
    const state = createGameRecorderState({
      hotkeys: {
        recordStart: 'CommandOrControl+Shift+G',
        stop: 'CommandOrControl+Alt+S',
        playbackStart: 'CommandOrControl+Alt+L'
      }
    })
    const controller = createGameRecorderController({ state })

    renderWithUiProviders(<GameRecorderPage controller={controller} />)

    expect(screen.getByText('还没有游戏录制')).toBeInTheDocument()
    expect(screen.getByText(/Ctrl\+Shift\+G/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始录制' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '回放选中' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '停止当前任务' })).toBeDisabled()
    expect(screen.getByLabelText('开始录制快捷键')).toBeEnabled()
    expect(screen.getByRole('button', { name: '保存全局热键' })).toBeDisabled()
  })

  it('renders only summary data and routes recording, playback, rename and config actions', async () => {
    const user = userEvent.setup()
    const recording = createRecording()
    const state = createGameRecorderState({
      recordings: [recording],
      activeRecordingId: recording.id
    })
    const controller = createGameRecorderController({
      state,
      selectedRecording: recording,
      nameInput: '新的录制名称',
      hasNameChanges: true,
      hasPlaybackChanges: true,
      hasHotkeyChanges: true
    })

    renderWithUiProviders(<GameRecorderPage controller={controller} />)

    expect(screen.getAllByText('game.exe')).toHaveLength(2)
    expect(screen.getByText('测试游戏')).toBeInTheDocument()
    expect(screen.getByText('320')).toBeInTheDocument()
    expect(screen.queryByText(/scanCode|mouseMove|dx|dy/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '开始录制' }))
    await user.click(screen.getByRole('button', { name: '回放选中' }))
    await user.click(screen.getByRole('button', { name: '重命名' }))
    await user.click(screen.getByRole('button', { name: '保存回放配置' }))
    await user.click(screen.getByRole('button', { name: '保存全局热键' }))

    expect(controller.startRecording).toHaveBeenCalledTimes(1)
    expect(controller.startPlayback).toHaveBeenCalledWith()
    expect(controller.renameSelected).toHaveBeenCalledTimes(1)
    expect(controller.savePlayback).toHaveBeenCalledTimes(1)
    expect(controller.saveHotkeys).toHaveBeenCalledTimes(1)
  })

  it('locks editing during capture or playback and keeps the stop action available', async () => {
    const user = userEvent.setup()
    const recording = createRecording()
    const state = createGameRecorderState({
      recordings: [recording],
      activeRecordingId: recording.id,
      activity: 'recording'
    })
    const controller = createGameRecorderController({
      state,
      selectedRecording: recording,
      isBusy: true,
      isIdle: false,
      status: { label: '游戏录制中', tone: 'warning' }
    })

    renderWithUiProviders(<GameRecorderPage controller={controller} />)

    expect(screen.getByRole('button', { name: '开始录制' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '回放选中' })).toBeDisabled()
    expect(screen.getByLabelText('录制名称')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '停止当前任务' }))
    expect(controller.stopActivity).toHaveBeenCalledTimes(1)
  })

  it('disables the whole game recorder while a macro task owns global input', () => {
    const recording = createRecording()
    const state = createGameRecorderState({
      recordings: [recording],
      activeRecordingId: recording.id
    })
    const controller = createGameRecorderController({
      state,
      selectedRecording: recording,
      blockedByMacro: true,
      isBusy: true,
      isIdle: false,
      status: { label: '宏任务占用中', tone: 'warning' }
    })

    renderWithUiProviders(<GameRecorderPage controller={controller} />)

    expect(
      screen.getByText('宏流程正在录制或执行，请先停止宏任务再编辑或启动游戏录制')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始录制' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '回放选中' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '停止当前任务' })).toBeDisabled()
    expect(screen.getByLabelText('开始录制快捷键')).toBeDisabled()
  })

  it('shows hotkey conflicts and captures a replacement shortcut from the input', async () => {
    const user = userEvent.setup()
    const recording = createRecording()
    const state = createGameRecorderState({
      recordings: [recording],
      activeRecordingId: recording.id,
      hotkeyErrors: ['开始录制快捷键与宏开始执行冲突']
    })
    const controller = createGameRecorderController({ state, selectedRecording: recording })

    renderWithUiProviders(<GameRecorderPage controller={controller} />)

    expect(screen.getByText('开始录制快捷键与宏开始执行冲突')).toBeInTheDocument()
    const input = screen.getByLabelText('开始录制快捷键')
    await user.click(input)
    await user.keyboard('{Control>}{Alt>}r{/Alt}{/Control}')

    expect(controller.startHotkeyCapture).toHaveBeenCalledWith('recordStart')
    expect(controller.captureHotkey).toHaveBeenCalled()
  })

  it('requires explicit confirmation before replaying into a different foreground program', async () => {
    const user = userEvent.setup()
    const recording = createRecording()
    const state = createGameRecorderState({
      recordings: [recording],
      activeRecordingId: recording.id,
      targetMismatch: true
    })
    const controller = createGameRecorderController({
      state,
      selectedRecording: recording,
      targetMismatchPromptOpen: true
    })

    renderWithUiProviders(<GameRecorderPage controller={controller} />)

    expect(screen.getByRole('alertdialog')).toHaveTextContent('当前前台程序与录制目标不一致')
    await user.click(screen.getByRole('button', { name: '仍然回放' }))
    expect(controller.startPlayback).toHaveBeenCalledWith(true)
  })

  it('confirms destructive deletion before removing a recording', async () => {
    const user = userEvent.setup()
    const recording = createRecording()
    const state = createGameRecorderState({
      recordings: [recording],
      activeRecordingId: recording.id
    })
    const controller = createGameRecorderController({ state, selectedRecording: recording })

    renderWithUiProviders(<GameRecorderPage controller={controller} />)

    await user.click(screen.getByRole('button', { name: `删除录制 ${recording.name}` }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('永久删除')
    await user.click(screen.getByRole('button', { name: '删除录制' }))
    expect(controller.deleteSelected).toHaveBeenCalledTimes(1)
  })
})
