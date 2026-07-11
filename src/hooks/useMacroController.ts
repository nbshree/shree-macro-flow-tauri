import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Dispatch,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent,
  RefObject,
  SetStateAction
} from 'react'

import type { AppearancePreferences, MacroPoint, MacroSettings, MacroState } from '../lib/macro-api'

export const emergencyStopHotkey = 'Ctrl+Alt+Esc'

const minLogPanelHeight = 96
const minFlowPanelHeight = 180
const logResizeHandleHeight = 12

export const emptyState: MacroState = {
  points: [],
  settings: {
    clickIntervalSeconds: 0.5,
    loopIntervalSeconds: 1,
    startDelaySeconds: 1,
    loopMode: 'infinite',
    loopCount: 1,
    hotkeys: {
      capture: 'CommandOrControl+Alt+Q',
      start: 'CommandOrControl+Alt+P',
      stop: 'CommandOrControl+Alt+O'
    }
  },
  appearance: {
    themeId: 'longyin',
    cleanMode: false
  },
  activeProfileId: '',
  profiles: [],
  isRecording: false,
  isRunning: false,
  currentIndex: -1,
  countdownRemaining: 0,
  completedLoops: 0,
  hotkeyErrors: [],
  logs: []
}

export function formatHotkey(value: string): string {
  return value.replace('CommandOrControl', 'Ctrl')
}

function getLogPanelMaxHeight(): number {
  const workspaceHeight = document.querySelector<HTMLElement>('.main-workspace')?.clientHeight ?? 0
  const availableHeight =
    workspaceHeight > 0 ? workspaceHeight : Math.max(0, window.innerHeight - 120)
  return Math.max(minLogPanelHeight, availableHeight - minFlowPanelHeight - logResizeHandleHeight)
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

function keyStepFromEvent(
  event: ReactKeyboardEvent<HTMLInputElement>
): { key: string; modifiers: MacroPoint['modifiers'] } | null {
  const key =
    event.key.length === 1 ? event.key.toUpperCase() : event.key === 'Escape' ? 'Esc' : event.key
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return null

  const modifiers: MacroPoint['modifiers'] = []
  if (event.ctrlKey || event.metaKey) modifiers.push('Control')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  return { key: key === ' ' ? 'Space' : key, modifiers }
}

export function formatKeyStep(point: Pick<MacroPoint, 'key' | 'modifiers'>): string {
  return [
    ...point.modifiers.map((modifier) => (modifier === 'Control' ? 'Ctrl' : modifier)),
    point.key
  ].join('+')
}

export type MacroController = {
  state: MacroState
  draftSettings: MacroSettings
  setDraftSettings: Dispatch<SetStateAction<MacroSettings>>
  draftPoints: Record<string, MacroPoint>
  profileNameInput: string
  setProfileNameInput: Dispatch<SetStateAction<string>>
  isRenamingProfile: boolean
  setIsRenamingProfile: Dispatch<SetStateAction<boolean>>
  capturingHotkey: keyof MacroSettings['hotkeys'] | null
  draggingPointId: string | null
  setDraggingPointId: Dispatch<SetStateAction<string | null>>
  isAddingKeyStep: boolean
  capturingPointKeyId: string | null
  setCapturingPointKeyId: Dispatch<SetStateAction<string | null>>
  keyDraft: { key: string; modifiers: MacroPoint['modifiers'] }
  keyStepError: string
  logPanelHeight: number
  logPanelMaxHeight: number
  profileNameInputRef: RefObject<HTMLInputElement | null>
  isEditingLocked: boolean
  canStopRecording: boolean
  status: { label: string; tone: 'warning' | 'success' | 'primary' | 'muted' }
  targetLoops: string
  updateState: (action: Promise<MacroState>) => Promise<void>
  updateAppearance: (appearance: Partial<AppearancePreferences>) => Promise<void>
  updateDraftNumber: (
    key: 'clickIntervalSeconds' | 'loopIntervalSeconds' | 'startDelaySeconds' | 'loopCount',
    value: string
  ) => void
  startHotkeyCapture: (key: keyof MacroSettings['hotkeys']) => void
  stopHotkeyCapture: () => void
  captureHotkey: (
    event: ReactKeyboardEvent<HTMLInputElement>,
    key: keyof MacroSettings['hotkeys']
  ) => void
  updateDraftPoint: (id: string, patch: Partial<MacroPoint>) => void
  savePoint: (id: string) => void
  syncDefaultDelayToPoints: () => Promise<void>
  closeKeyStepEditor: () => void
  openKeyStepEditor: () => void
  captureKeyStep: (event: ReactKeyboardEvent<HTMLInputElement>) => void
  saveKeyStep: () => void
  capturePointKey: (event: ReactKeyboardEvent<HTMLInputElement>, pointId: string) => void
  dropPoint: (targetIndex: number) => void
  startResizeLogPanel: (event: MouseEvent<HTMLDivElement>) => void
  resizeLogPanelBy: (delta: number) => void
  createProfile: () => void
  renameActiveProfile: () => void
  cancelRenameProfile: () => void
  removeActiveProfile: () => void
}

export function useMacroController(): MacroController {
  const [state, setState] = useState<MacroState>(emptyState)
  const [draftSettings, setDraftSettingsState] = useState<MacroSettings>(emptyState.settings)
  const [draftPoints, setDraftPoints] = useState<Record<string, MacroPoint>>({})
  const [profileNameInput, setProfileNameInputState] = useState('')
  const [isRenamingProfile, setIsRenamingProfile] = useState(false)
  const [capturingHotkey, setCapturingHotkey] = useState<keyof MacroSettings['hotkeys'] | null>(
    null
  )
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null)
  const [isAddingKeyStep, setIsAddingKeyStep] = useState(false)
  const [capturingPointKeyId, setCapturingPointKeyId] = useState<string | null>(null)
  const [keyDraft, setKeyDraft] = useState<{
    key: string
    modifiers: MacroPoint['modifiers']
  }>({ key: '', modifiers: [] })
  const [keyStepError, setKeyStepError] = useState('')
  const [logPanelHeight, setLogPanelHeight] = useState(140)
  const [logPanelMaxHeight, setLogPanelMaxHeight] = useState(getLogPanelMaxHeight)
  const profileNameInputRef = useRef<HTMLInputElement | null>(null)
  const draftSettingsDirtyRef = useRef(false)
  const dirtyDraftPointIdsRef = useRef<Set<string>>(new Set())
  const profileNameDirtyRef = useRef(false)
  const isResizingLogRef = useRef(false)
  const resizeStartYRef = useRef(0)
  const resizeStartHeightRef = useRef(140)

  const setDraftSettings = useCallback<Dispatch<SetStateAction<MacroSettings>>>((value) => {
    draftSettingsDirtyRef.current = true
    setDraftSettingsState(value)
  }, [])

  const setProfileNameInput = useCallback<Dispatch<SetStateAction<string>>>((value) => {
    profileNameDirtyRef.current = true
    setProfileNameInputState(value)
  }, [])

  function applyState(nextState: MacroState, preserveDrafts = false): void {
    setState(nextState)

    if (!preserveDrafts || !draftSettingsDirtyRef.current) {
      draftSettingsDirtyRef.current = false
      setDraftSettingsState(nextState.settings)
    }

    const nextDraftPoints = Object.fromEntries(nextState.points.map((point) => [point.id, point]))
    if (preserveDrafts && dirtyDraftPointIdsRef.current.size > 0) {
      setDraftPoints((current) => {
        for (const id of [...dirtyDraftPointIdsRef.current]) {
          if (nextDraftPoints[id] && current[id]) nextDraftPoints[id] = current[id]
          else dirtyDraftPointIdsRef.current.delete(id)
        }
        return nextDraftPoints
      })
    } else {
      dirtyDraftPointIdsRef.current.clear()
      setDraftPoints(nextDraftPoints)
    }

    if (!preserveDrafts || !profileNameDirtyRef.current) {
      profileNameDirtyRef.current = false
      setProfileNameInputState(
        nextState.profiles.find((profile) => profile.id === nextState.activeProfileId)?.name ?? ''
      )
    }
  }

  useEffect(() => {
    let disposed = false
    const unsubscribe = window.api.onState((nextState) => {
      if (!disposed) applyState(nextState, true)
    })

    void window.api
      .getState()
      .then((nextState) => {
        if (!disposed) applyState(nextState)
      })
      .catch((error: unknown) => {
        if (!disposed) console.error('读取应用状态失败', error)
      })

    return () => {
      disposed = true
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    return () => {
      void window.api.setKeyCapture(false)
    }
  }, [])

  useEffect(() => {
    if (isRenamingProfile) {
      profileNameInputRef.current?.focus()
      profileNameInputRef.current?.select()
    }
  }, [isRenamingProfile])

  useEffect(() => {
    function stopResize(): void {
      isResizingLogRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    function resizeLogPanel(event: globalThis.MouseEvent): void {
      if (!isResizingLogRef.current) return
      const delta = resizeStartYRef.current - event.clientY
      const maxHeight = getLogPanelMaxHeight()
      const nextHeight = Math.min(
        maxHeight,
        Math.max(minLogPanelHeight, resizeStartHeightRef.current + delta)
      )
      setLogPanelHeight(nextHeight)
    }

    function updateLogPanelBounds(): void {
      const maxHeight = getLogPanelMaxHeight()
      setLogPanelMaxHeight(maxHeight)
      setLogPanelHeight((current) => Math.min(maxHeight, Math.max(minLogPanelHeight, current)))
    }

    updateLogPanelBounds()
    window.addEventListener('mousemove', resizeLogPanel)
    window.addEventListener('mouseup', stopResize)
    window.addEventListener('resize', updateLogPanelBounds)
    return () => {
      window.removeEventListener('mousemove', resizeLogPanel)
      window.removeEventListener('mouseup', stopResize)
      window.removeEventListener('resize', updateLogPanelBounds)
    }
  }, [])

  const isEditingLocked = state.isRecording || state.isRunning
  const canStopRecording = state.isRecording
  const status = useMemo<MacroController['status']>(() => {
    if (state.isRunning && state.countdownRemaining > 0) {
      return { label: `${state.countdownRemaining}s 后执行`, tone: 'warning' }
    }
    if (state.isRunning) return { label: '执行中', tone: 'success' }
    if (state.isRecording) return { label: '录制中', tone: 'warning' }
    if (state.points.length > 0) return { label: '已配置', tone: 'primary' }
    return { label: '待命', tone: 'muted' }
  }, [state.countdownRemaining, state.isRecording, state.isRunning, state.points.length])
  const targetLoops =
    state.settings.loopMode === 'infinite' ? '无限' : `${Math.max(1, state.settings.loopCount)}`

  async function updateState(action: Promise<MacroState>): Promise<void> {
    try {
      applyState(await action)
    } catch (error) {
      console.error('更新应用状态失败', error)
    }
  }

  async function updateAppearance(appearance: Partial<AppearancePreferences>): Promise<void> {
    applyState(await window.api.updateAppearance(appearance), true)
  }

  function updateDraftNumber(
    key: 'clickIntervalSeconds' | 'loopIntervalSeconds' | 'startDelaySeconds' | 'loopCount',
    value: string
  ): void {
    setDraftSettings((current) => ({
      ...current,
      [key]: Math.max(key === 'loopCount' ? 1 : 0, Number(value) || (key === 'loopCount' ? 1 : 0))
    }))
  }

  function updateDraftHotkey(key: keyof MacroSettings['hotkeys'], value: string): void {
    setDraftSettings((current) => ({
      ...current,
      hotkeys: { ...current.hotkeys, [key]: normalizeHotkey(value) }
    }))
  }

  function startHotkeyCapture(key: keyof MacroSettings['hotkeys']): void {
    setCapturingHotkey(key)
    void window.api.setKeyCapture(true)
  }

  function stopHotkeyCapture(): void {
    setCapturingHotkey(null)
    void window.api.setKeyCapture(false)
  }

  function captureHotkey(
    event: ReactKeyboardEvent<HTMLInputElement>,
    key: keyof MacroSettings['hotkeys']
  ): void {
    event.preventDefault()
    const accelerator = acceleratorFromEvent(event)
    if (!accelerator) return
    updateDraftHotkey(key, accelerator)
    stopHotkeyCapture()
  }

  function updateDraftPoint(id: string, patch: Partial<MacroPoint>): void {
    dirtyDraftPointIdsRef.current.add(id)
    setDraftPoints((current) => ({
      ...current,
      [id]: { ...current[id], ...patch }
    }))
  }

  function savePoint(id: string): void {
    const point = draftPoints[id]
    if (!point || isEditingLocked) return
    void updateState(window.api.updatePoint(id, point))
  }

  async function syncDefaultDelayToPoints(): Promise<void> {
    try {
      applyState(await window.api.updateSettings(draftSettings))
      applyState(await window.api.syncPointDelays())
    } catch (error) {
      console.error('同步步骤等待时间失败', error)
    }
  }

  function closeKeyStepEditor(): void {
    setIsAddingKeyStep(false)
    setKeyDraft({ key: '', modifiers: [] })
    setKeyStepError('')
    void window.api.setKeyCapture(false)
  }

  function openKeyStepEditor(): void {
    setIsAddingKeyStep(true)
    setKeyDraft({ key: '', modifiers: [] })
    setKeyStepError('')
    void window.api.setKeyCapture(true)
  }

  function captureKeyStep(event: ReactKeyboardEvent<HTMLInputElement>): void {
    event.preventDefault()
    if (event.key === 'Escape') {
      closeKeyStepEditor()
      return
    }
    const nextDraft = keyStepFromEvent(event)
    if (!nextDraft) return
    setKeyDraft(nextDraft)
    setKeyStepError('')
  }

  function saveKeyStep(): void {
    if (!keyDraft.key) {
      setKeyStepError('请先录制一个按键或组合键')
      return
    }
    const accelerator = [...keyDraft.modifiers, keyDraft.key].join('+').toLowerCase()
    const conflicts = [emergencyStopHotkey, ...Object.values(state.settings.hotkeys)].some(
      (hotkey) => hotkey.replace(/commandorcontrol/gi, 'control').toLowerCase() === accelerator
    )
    if (conflicts) {
      setKeyStepError('该组合键与应用全局热键冲突，不能保存')
      return
    }
    void updateState(window.api.addKeyPoint(keyDraft.key, keyDraft.modifiers))
    closeKeyStepEditor()
  }

  function capturePointKey(event: ReactKeyboardEvent<HTMLInputElement>, pointId: string): void {
    event.preventDefault()
    if (event.key === 'Escape') {
      event.currentTarget.blur()
      return
    }
    const nextKey = keyStepFromEvent(event)
    if (!nextKey) return
    void updateState(
      window.api.updatePoint(pointId, { key: nextKey.key, modifiers: nextKey.modifiers })
    )
    setCapturingPointKeyId(null)
    void window.api.setKeyCapture(false)
    event.currentTarget.blur()
  }

  function dropPoint(targetIndex: number): void {
    if (!draggingPointId || isEditingLocked) return
    void updateState(window.api.reorderPoint(draggingPointId, targetIndex))
    setDraggingPointId(null)
  }

  function startResizeLogPanel(event: MouseEvent<HTMLDivElement>): void {
    isResizingLogRef.current = true
    resizeStartYRef.current = event.clientY
    resizeStartHeightRef.current = logPanelHeight
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }

  function resizeLogPanelBy(delta: number): void {
    const maxHeight = getLogPanelMaxHeight()
    setLogPanelMaxHeight(maxHeight)
    setLogPanelHeight((current) =>
      Math.min(maxHeight, Math.max(minLogPanelHeight, current + delta))
    )
  }

  function createProfile(): void {
    if (isEditingLocked) return
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase()
    void updateState(window.api.createProfile(`新方案${suffix}`))
  }

  function renameActiveProfile(): void {
    if (isEditingLocked || !state.activeProfileId) return
    const name = profileNameInput.trim()
    const currentName =
      state.profiles.find((profile) => profile.id === state.activeProfileId)?.name ?? ''
    setIsRenamingProfile(false)
    if (!name || name === currentName) {
      profileNameDirtyRef.current = false
      setProfileNameInputState(currentName)
      return
    }
    void updateState(window.api.renameProfile(state.activeProfileId, name))
  }

  function cancelRenameProfile(): void {
    setIsRenamingProfile(false)
    profileNameDirtyRef.current = false
    setProfileNameInputState(
      state.profiles.find((profile) => profile.id === state.activeProfileId)?.name ?? ''
    )
  }

  function removeActiveProfile(): void {
    if (isEditingLocked || !state.activeProfileId || state.profiles.length <= 1) return
    void updateState(window.api.deleteProfile(state.activeProfileId))
  }

  return {
    state,
    draftSettings,
    setDraftSettings,
    draftPoints,
    profileNameInput,
    setProfileNameInput,
    isRenamingProfile,
    setIsRenamingProfile,
    capturingHotkey,
    draggingPointId,
    setDraggingPointId,
    isAddingKeyStep,
    capturingPointKeyId,
    setCapturingPointKeyId,
    keyDraft,
    keyStepError,
    logPanelHeight,
    logPanelMaxHeight,
    profileNameInputRef,
    isEditingLocked,
    canStopRecording,
    status,
    targetLoops,
    updateState,
    updateAppearance,
    updateDraftNumber,
    startHotkeyCapture,
    stopHotkeyCapture,
    captureHotkey,
    updateDraftPoint,
    savePoint,
    syncDefaultDelayToPoints,
    closeKeyStepEditor,
    openKeyStepEditor,
    captureKeyStep,
    saveKeyStep,
    capturePointKey,
    dropPoint,
    startResizeLogPanel,
    resizeLogPanelBy,
    createProfile,
    renameActiveProfile,
    cancelRenameProfile,
    removeActiveProfile
  }
}
