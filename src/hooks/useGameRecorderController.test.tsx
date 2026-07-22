import { act, renderHook, waitFor } from '@testing-library/react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GameRecorderState, GameRecordingSummary, MacroAPI } from '../lib/macro-api'
import {
  createGameRecorderState,
  createMacroApi,
  createMacroState,
  installMacroApi
} from '../test/test-utils'
import { useGameRecorderController } from './useGameRecorderController'

function createRecording(overrides: Partial<GameRecordingSummary> = {}): GameRecordingSummary {
  return {
    id: 'recording-1',
    name: '测试录制',
    durationMs: 5_000,
    eventCount: 100,
    keyboardEventCount: 20,
    mouseEventCount: 80,
    target: { processName: 'game.exe', windowTitle: '游戏窗口' },
    createdAt: 1,
    updatedAt: 2,
    playback: {
      speed: 1,
      loopMode: 'count',
      loopCount: 2,
      loopIntervalSeconds: 1
    },
    ...overrides
  }
}

function installGameApi(initialState: GameRecorderState) {
  let stateListener: ((state: GameRecorderState) => void) | undefined
  const api = createMacroApi(createMacroState(), initialState)
  api.onGameRecorderState.mockImplementation((listener) => {
    stateListener = listener
    return () => {
      stateListener = undefined
    }
  })
  installMacroApi(api)
  return {
    api,
    emit(nextState: GameRecorderState) {
      stateListener?.(nextState)
    }
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useGameRecorderController', () => {
  it('preserves a dirty playback draft while high-level progress state is broadcast', async () => {
    const recording = createRecording()
    const initialState = createGameRecorderState({
      recordings: [recording],
      activeRecordingId: recording.id
    })
    const { emit } = installGameApi(initialState)
    const { result, unmount } = renderHook(() => useGameRecorderController())

    await waitFor(() => expect(result.current.selectedRecording?.id).toBe(recording.id))
    act(() => {
      result.current.setDraftPlayback((current) => ({ ...current, speed: 2 }))
    })
    act(() => {
      emit({ ...initialState, activity: 'playing', completedLoops: 1 })
    })

    expect(result.current.draftPlayback.speed).toBe(2)
    expect(result.current.state.completedLoops).toBe(1)
    expect(result.current.status).toEqual({ label: '游戏回放中', tone: 'success' })
    expect(result.current.progressLabel).toBe('已完成 1 / 2 轮')

    unmount()
  })

  it('treats clearing a recording name as an unsaved draft', async () => {
    const recording = createRecording()
    const initialState = createGameRecorderState({
      recordings: [recording],
      activeRecordingId: recording.id
    })
    installGameApi(initialState)
    const { result, unmount } = renderHook(() => useGameRecorderController())

    await waitFor(() => expect(result.current.selectedRecording).not.toBeNull())
    act(() => result.current.setNameInput(''))

    expect(result.current.hasNameChanges).toBe(true)

    unmount()
  })

  it('exits hotkey capture and blocks every game action when the macro becomes busy', async () => {
    const recording = createRecording()
    const initialState = createGameRecorderState({
      recordings: [recording],
      activeRecordingId: recording.id
    })
    const { api } = installGameApi(initialState)
    const { result, rerender, unmount } = renderHook(
      ({ macroBusy }) => useGameRecorderController(macroBusy),
      { initialProps: { macroBusy: false } }
    )

    await waitFor(() => expect(result.current.selectedRecording).not.toBeNull())
    act(() => result.current.startHotkeyCapture('recordStart'))
    expect(result.current.capturingHotkey).toBe('recordStart')
    expect(api.setKeyCapture).toHaveBeenLastCalledWith(true)

    rerender({ macroBusy: true })
    await waitFor(() => expect(result.current.capturingHotkey).toBeNull())
    expect(api.setKeyCapture).toHaveBeenLastCalledWith(false)
    expect(result.current.isBusy).toBe(true)
    expect(result.current.isIdle).toBe(false)
    expect(result.current.status).toEqual({ label: '宏任务占用中', tone: 'warning' })

    await act(async () => {
      await result.current.startRecording()
      await result.current.startPlayback()
      await result.current.stopActivity()
      await result.current.selectRecording('another-recording')
    })
    expect(api.startGameRecording).not.toHaveBeenCalled()
    expect(api.startGamePlayback).not.toHaveBeenCalled()
    expect(api.stopGameActivity).not.toHaveBeenCalled()
    expect(api.selectGameRecording).not.toHaveBeenCalled()

    unmount()
  })

  it('opens target mismatch confirmation and retries only with explicit approval', async () => {
    const recording = createRecording()
    const initialState = createGameRecorderState({
      recordings: [recording],
      activeRecordingId: recording.id
    })
    const { api } = installGameApi(initialState)
    api.startGamePlayback.mockImplementation(async (allowTargetMismatch = false) =>
      allowTargetMismatch
        ? {
            ...initialState,
            activity: 'playbackCountdown',
            countdownRemaining: 3,
            targetMismatch: false
          }
        : { ...initialState, targetMismatch: true }
    )
    const { result, unmount } = renderHook(() => useGameRecorderController())

    await waitFor(() => expect(result.current.selectedRecording).not.toBeNull())
    await act(async () => {
      await result.current.startPlayback()
    })
    expect(api.startGamePlayback).toHaveBeenLastCalledWith(false)
    expect(result.current.targetMismatchPromptOpen).toBe(true)

    act(() => result.current.dismissTargetMismatch())
    expect(result.current.targetMismatchPromptOpen).toBe(false)

    await act(async () => {
      await result.current.startPlayback(true)
    })
    expect(api.startGamePlayback).toHaveBeenLastCalledWith(true)
    expect(result.current.state.activity).toBe('playbackCountdown')
    expect(result.current.targetMismatchPromptOpen).toBe(false)

    unmount()
  })

  it('saves normalized playback settings for the selected recording', async () => {
    const recording = createRecording()
    const initialState = createGameRecorderState({
      recordings: [recording],
      activeRecordingId: recording.id
    })
    const { api } = installGameApi(initialState)
    api.updateGamePlaybackSettings.mockImplementation(async (id, settings) => ({
      ...initialState,
      recordings: initialState.recordings.map((item) =>
        item.id === id ? { ...item, playback: settings } : item
      )
    }))
    const { result, unmount } = renderHook(() => useGameRecorderController())

    await waitFor(() => expect(result.current.selectedRecording).not.toBeNull())
    act(() => {
      result.current.setDraftPlayback({
        speed: 1.5,
        loopMode: 'count',
        loopCount: 4.7,
        loopIntervalSeconds: -2
      })
    })
    expect(result.current.hasPlaybackChanges).toBe(true)

    await act(async () => {
      await result.current.savePlayback()
    })

    expect(api.updateGamePlaybackSettings).toHaveBeenCalledWith(recording.id, {
      speed: 1.5,
      loopMode: 'count',
      loopCount: 5,
      loopIntervalSeconds: 0
    })
    expect(result.current.hasPlaybackChanges).toBe(false)

    unmount()
  })

  it('keeps a rejected hotkey draft visible so the conflict can be corrected', async () => {
    const initialState = createGameRecorderState()
    const { api } = installGameApi(initialState)
    api.updateGameRecorderHotkeys.mockResolvedValue({
      ...initialState,
      hotkeyErrors: ['开始录制快捷键与宏开始执行冲突'],
      lastError: '配置未保存：游戏录制热键存在冲突'
    })
    const { result, unmount } = renderHook(() => useGameRecorderController())

    await waitFor(() => expect(api.getGameRecorderState).toHaveBeenCalled())
    act(() => {
      result.current.captureHotkey(
        {
          preventDefault: vi.fn(),
          key: 'G',
          ctrlKey: true,
          altKey: true,
          shiftKey: false,
          metaKey: false,
          currentTarget: { blur: vi.fn() }
        } as unknown as ReactKeyboardEvent<HTMLInputElement>,
        'recordStart'
      )
    })
    expect(result.current.draftHotkeys.recordStart).toBe('CommandOrControl+Alt+G')

    await act(async () => {
      await result.current.saveHotkeys()
    })

    expect(result.current.state.hotkeyErrors).toContain('开始录制快捷键与宏开始执行冲突')
    expect(result.current.draftHotkeys.recordStart).toBe('CommandOrControl+Alt+G')
    expect(result.current.hasHotkeyChanges).toBe(true)

    unmount()
  })

  it('reports command failures without replacing the last valid recorder state', async () => {
    const recording = createRecording()
    const initialState = createGameRecorderState({
      recordings: [recording],
      activeRecordingId: recording.id
    })
    const { api } = installGameApi(initialState)
    vi.mocked(api.startGameRecording as MacroAPI['startGameRecording']).mockRejectedValue(
      new Error('宏任务正在运行')
    )
    const { result, unmount } = renderHook(() => useGameRecorderController())

    await waitFor(() => expect(result.current.selectedRecording?.id).toBe(recording.id))
    await act(async () => {
      await result.current.startRecording()
    })

    expect(result.current.actionError).toBe('宏任务正在运行')
    expect(result.current.selectedRecording?.id).toBe(recording.id)

    unmount()
  })
})
