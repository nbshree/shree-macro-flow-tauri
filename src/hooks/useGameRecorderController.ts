import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, KeyboardEvent as ReactKeyboardEvent, SetStateAction } from 'react'

import type {
  GamePlaybackSettings,
  GameRecorderHotkeys,
  GameRecorderState,
  GameRecordingSummary
} from '../lib/macro-api'

export const emptyGameRecorderState: GameRecorderState = {
  recordings: [],
  activeRecordingId: null,
  hotkeys: {
    recordStart: 'CommandOrControl+Alt+R',
    stop: 'CommandOrControl+Alt+S',
    playbackStart: 'CommandOrControl+Alt+L'
  },
  activity: 'idle',
  countdownRemaining: 0,
  completedLoops: 0,
  targetMismatch: false,
  hotkeyErrors: [],
  lastError: null
}

const defaultPlaybackSettings: GamePlaybackSettings = {
  speed: 1,
  loopMode: 'count',
  loopCount: 1,
  loopIntervalSeconds: 1
}

type RecorderStatus = {
  label: string
  tone: 'warning' | 'success' | 'primary' | 'muted'
}

function normalizeHotkey(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '')
    .replace(/^ctrl\+/i, 'CommandOrControl+')
    .replace(/\+ctrl\+/i, '+CommandOrControl+')
}

function acceleratorFromEvent(event: ReactKeyboardEvent<HTMLInputElement>): string | null {
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null

  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('CommandOrControl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  parts.push(key === 'Escape' ? 'Esc' : key === ' ' ? 'Space' : key)
  return parts.join('+')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function formatGameHotkey(value: string): string {
  return value.replace('CommandOrControl', 'Ctrl')
}

export type GameRecorderController = {
  state: GameRecorderState
  selectedRecording: GameRecordingSummary | null
  draftHotkeys: GameRecorderHotkeys
  draftPlayback: GamePlaybackSettings
  setDraftPlayback: Dispatch<SetStateAction<GamePlaybackSettings>>
  nameInput: string
  setNameInput: Dispatch<SetStateAction<string>>
  capturingHotkey: keyof GameRecorderHotkeys | null
  pendingAction: string | null
  actionError: string | null
  blockedByMacro: boolean
  isBusy: boolean
  isIdle: boolean
  hasHotkeyChanges: boolean
  hasPlaybackChanges: boolean
  hasNameChanges: boolean
  targetMismatchPromptOpen: boolean
  status: RecorderStatus
  progressLabel: string
  startRecording: () => Promise<void>
  stopActivity: () => Promise<void>
  startPlayback: (allowTargetMismatch?: boolean) => Promise<void>
  selectRecording: (id: string) => Promise<void>
  renameSelected: () => Promise<void>
  deleteSelected: () => Promise<void>
  saveHotkeys: () => Promise<void>
  savePlayback: () => Promise<void>
  setPlaybackSpeed: (value: string) => void
  setPlaybackLoopMode: (value: string) => void
  updatePlaybackNumber: (key: 'loopCount' | 'loopIntervalSeconds', value: string) => void
  startHotkeyCapture: (key: keyof GameRecorderHotkeys) => void
  stopHotkeyCapture: () => void
  captureHotkey: (
    event: ReactKeyboardEvent<HTMLInputElement>,
    key: keyof GameRecorderHotkeys
  ) => void
  dismissTargetMismatch: () => void
}

export function useGameRecorderController(macroBusy = false): GameRecorderController {
  const [state, setState] = useState<GameRecorderState>(emptyGameRecorderState)
  const [draftHotkeysState, setDraftHotkeysState] = useState<GameRecorderHotkeys>(
    emptyGameRecorderState.hotkeys
  )
  const [draftPlaybackState, setDraftPlaybackState] =
    useState<GamePlaybackSettings>(defaultPlaybackSettings)
  const [nameInputState, setNameInputState] = useState('')
  const [capturingHotkey, setCapturingHotkey] = useState<keyof GameRecorderHotkeys | null>(null)
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [targetMismatchDismissed, setTargetMismatchDismissed] = useState(false)
  const hotkeysDirtyRef = useRef(false)
  const playbackDirtyRef = useRef(false)
  const nameDirtyRef = useRef(false)
  const selectedIdRef = useRef<string | null>(null)

  const setDraftPlayback = useCallback<Dispatch<SetStateAction<GamePlaybackSettings>>>((value) => {
    playbackDirtyRef.current = true
    setDraftPlaybackState(value)
  }, [])

  const setNameInput = useCallback<Dispatch<SetStateAction<string>>>((value) => {
    nameDirtyRef.current = true
    setNameInputState(value)
  }, [])

  const applyState = useCallback((nextState: GameRecorderState, preserveDrafts = false): void => {
    setState(nextState)

    if (!preserveDrafts || !hotkeysDirtyRef.current) {
      hotkeysDirtyRef.current = false
      setDraftHotkeysState(nextState.hotkeys)
    }

    const selectionChanged = selectedIdRef.current !== nextState.activeRecordingId
    selectedIdRef.current = nextState.activeRecordingId
    const selected =
      nextState.recordings.find((recording) => recording.id === nextState.activeRecordingId) ?? null

    if (selectionChanged || !preserveDrafts || !playbackDirtyRef.current) {
      playbackDirtyRef.current = false
      setDraftPlaybackState(selected?.playback ?? defaultPlaybackSettings)
    }

    if (selectionChanged || !preserveDrafts || !nameDirtyRef.current) {
      nameDirtyRef.current = false
      setNameInputState(selected?.name ?? '')
    }

    if (!nextState.targetMismatch) setTargetMismatchDismissed(false)
  }, [])

  useEffect(() => {
    let disposed = false
    const unsubscribe = window.api.onGameRecorderState((nextState) => {
      if (!disposed) applyState(nextState, true)
    })

    void window.api
      .getGameRecorderState()
      .then((nextState) => {
        if (!disposed) applyState(nextState)
      })
      .catch((error: unknown) => {
        if (!disposed) setActionError(`读取游戏录制状态失败：${errorMessage(error)}`)
      })

    return () => {
      disposed = true
      unsubscribe()
    }
  }, [applyState])

  useEffect(() => {
    return () => {
      void window.api.setKeyCapture(false)
    }
  }, [])

  const selectedRecording = useMemo(
    () => state.recordings.find((recording) => recording.id === state.activeRecordingId) ?? null,
    [state.activeRecordingId, state.recordings]
  )
  const isIdle = state.activity === 'idle' && !macroBusy
  const isBusy = !isIdle

  useEffect(() => {
    if (!isBusy) return
    setCapturingHotkey(null)
    void window.api.setKeyCapture(false)
  }, [isBusy])

  const hasHotkeyChanges =
    draftHotkeysState.recordStart !== state.hotkeys.recordStart ||
    draftHotkeysState.stop !== state.hotkeys.stop ||
    draftHotkeysState.playbackStart !== state.hotkeys.playbackStart
  const hasPlaybackChanges = Boolean(
    selectedRecording &&
    (draftPlaybackState.speed !== selectedRecording.playback.speed ||
      draftPlaybackState.loopMode !== selectedRecording.playback.loopMode ||
      draftPlaybackState.loopCount !== selectedRecording.playback.loopCount ||
      draftPlaybackState.loopIntervalSeconds !== selectedRecording.playback.loopIntervalSeconds)
  )
  const hasNameChanges = Boolean(
    selectedRecording && nameInputState.trim() !== selectedRecording.name
  )
  const targetMismatchPromptOpen = state.targetMismatch && !targetMismatchDismissed

  const status = useMemo<RecorderStatus>(() => {
    if (macroBusy && state.activity === 'idle') {
      return { label: '宏任务占用中', tone: 'warning' }
    }
    switch (state.activity) {
      case 'recordingCountdown':
        return { label: `${state.countdownRemaining}s 后录制`, tone: 'warning' }
      case 'recording':
        return { label: '游戏录制中', tone: 'warning' }
      case 'playbackCountdown':
        return { label: `${state.countdownRemaining}s 后回放`, tone: 'warning' }
      case 'playing':
        return { label: '游戏回放中', tone: 'success' }
      default:
        return selectedRecording
          ? { label: '游戏录制已就绪', tone: 'primary' }
          : { label: '待命', tone: 'muted' }
    }
  }, [macroBusy, selectedRecording, state.activity, state.countdownRemaining])

  const progressLabel = useMemo(() => {
    if (!selectedRecording || state.activity !== 'playing') return '尚未开始'
    if (selectedRecording.playback.loopMode === 'infinite') {
      return `已完成 ${state.completedLoops} 轮 · 无限循环`
    }
    return `已完成 ${state.completedLoops} / ${selectedRecording.playback.loopCount} 轮`
  }, [selectedRecording, state.activity, state.completedLoops])

  async function runAction(
    name: string,
    action: Promise<GameRecorderState>,
    onSuccess?: (nextState: GameRecorderState) => void
  ): Promise<void> {
    setPendingAction(name)
    setActionError(null)
    try {
      const nextState = await action
      onSuccess?.(nextState)
      applyState(nextState, true)
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setPendingAction(null)
    }
  }

  async function startRecording(): Promise<void> {
    if (!isIdle || pendingAction) return
    await runAction('record', window.api.startGameRecording())
  }

  async function stopActivity(): Promise<void> {
    if (state.activity === 'idle' || pendingAction) return
    await runAction('stop', window.api.stopGameActivity())
  }

  async function startPlayback(allowTargetMismatch = false): Promise<void> {
    if (!isIdle || !selectedRecording || pendingAction) return
    setTargetMismatchDismissed(allowTargetMismatch)
    await runAction('playback', window.api.startGamePlayback(allowTargetMismatch))
  }

  async function selectRecording(id: string): Promise<void> {
    if (isBusy || pendingAction || id === state.activeRecordingId) return
    await runAction('select', window.api.selectGameRecording(id))
  }

  async function renameSelected(): Promise<void> {
    const name = nameInputState.trim()
    if (!isIdle || !selectedRecording || !name || !hasNameChanges || pendingAction) return
    await runAction('rename', window.api.renameGameRecording(selectedRecording.id, name), () => {
      nameDirtyRef.current = false
    })
  }

  async function deleteSelected(): Promise<void> {
    if (!isIdle || !selectedRecording || pendingAction) return
    await runAction('delete', window.api.deleteGameRecording(selectedRecording.id), () => {
      playbackDirtyRef.current = false
      nameDirtyRef.current = false
    })
  }

  async function saveHotkeys(): Promise<void> {
    if (!isIdle || !hasHotkeyChanges || pendingAction) return
    await runAction(
      'hotkeys',
      window.api.updateGameRecorderHotkeys(draftHotkeysState),
      (nextState) => {
        if (nextState.hotkeyErrors.length === 0) hotkeysDirtyRef.current = false
      }
    )
  }

  async function savePlayback(): Promise<void> {
    if (!isIdle || !selectedRecording || !hasPlaybackChanges || pendingAction) return
    const settings: GamePlaybackSettings = {
      ...draftPlaybackState,
      loopCount: Math.max(1, Math.round(draftPlaybackState.loopCount)),
      loopIntervalSeconds: Math.max(0, draftPlaybackState.loopIntervalSeconds)
    }
    await runAction(
      'settings',
      window.api.updateGamePlaybackSettings(selectedRecording.id, settings),
      () => {
        playbackDirtyRef.current = false
      }
    )
  }

  function setPlaybackSpeed(value: string): void {
    const speed = Number(value)
    if (speed !== 0.5 && speed !== 1 && speed !== 1.5 && speed !== 2) return
    setDraftPlayback((current) => ({ ...current, speed }))
  }

  function setPlaybackLoopMode(value: string): void {
    if (value !== 'count' && value !== 'infinite') return
    setDraftPlayback((current) => ({ ...current, loopMode: value }))
  }

  function updatePlaybackNumber(key: 'loopCount' | 'loopIntervalSeconds', value: string): void {
    setDraftPlayback((current) => ({
      ...current,
      [key]: Math.max(key === 'loopCount' ? 1 : 0, Number(value) || (key === 'loopCount' ? 1 : 0))
    }))
  }

  function startHotkeyCapture(key: keyof GameRecorderHotkeys): void {
    if (isBusy) return
    setCapturingHotkey(key)
    void window.api.setKeyCapture(true)
  }

  function stopHotkeyCapture(): void {
    setCapturingHotkey(null)
    void window.api.setKeyCapture(false)
  }

  function captureHotkey(
    event: ReactKeyboardEvent<HTMLInputElement>,
    key: keyof GameRecorderHotkeys
  ): void {
    event.preventDefault()
    const accelerator = acceleratorFromEvent(event)
    if (!accelerator) return
    hotkeysDirtyRef.current = true
    setDraftHotkeysState((current) => ({
      ...current,
      [key]: normalizeHotkey(accelerator)
    }))
    stopHotkeyCapture()
    event.currentTarget.blur()
  }

  function dismissTargetMismatch(): void {
    setTargetMismatchDismissed(true)
  }

  return {
    state,
    selectedRecording,
    draftHotkeys: draftHotkeysState,
    draftPlayback: draftPlaybackState,
    setDraftPlayback,
    nameInput: nameInputState,
    setNameInput,
    capturingHotkey,
    pendingAction,
    actionError,
    blockedByMacro: macroBusy,
    isBusy,
    isIdle,
    hasHotkeyChanges,
    hasPlaybackChanges,
    hasNameChanges,
    targetMismatchPromptOpen,
    status,
    progressLabel,
    startRecording,
    stopActivity,
    startPlayback,
    selectRecording,
    renameSelected,
    deleteSelected,
    saveHotkeys,
    savePlayback,
    setPlaybackSpeed,
    setPlaybackLoopMode,
    updatePlaybackNumber,
    startHotkeyCapture,
    stopHotkeyCapture,
    captureHotkey,
    dismissTargetMismatch
  }
}
