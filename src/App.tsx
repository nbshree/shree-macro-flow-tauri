import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CircleDot,
  Crosshair,
  Download,
  FolderOpen,
  GripVertical,
  Keyboard,
  ListChecks,
  MousePointerClick,
  Pencil,
  Play,
  Plus,
  Save,
  ScrollText,
  Settings,
  ShieldAlert,
  Square,
  TimerReset,
  Trash2,
  Upload
} from 'lucide-react'

type MacroPoint = {
  id: string
  label: string
  action: 'click' | 'key'
  x: number
  y: number
  key: string
  modifiers: Array<'Control' | 'Alt' | 'Shift'>
  delaySeconds: number
  createdAt: number
}

type MacroSettings = {
  clickIntervalSeconds: number
  loopIntervalSeconds: number
  startDelaySeconds: number
  loopMode: 'count' | 'infinite'
  loopCount: number
  hotkeys: {
    capture: string
    start: string
    stop: string
  }
}

type MacroState = {
  points: MacroPoint[]
  settings: MacroSettings
  activeProfileId: string
  profiles: Array<{
    id: string
    name: string
    updatedAt: number
  }>
  isRecording: boolean
  isRunning: boolean
  currentIndex: number
  countdownRemaining: number
  completedLoops: number
  hotkeyErrors: string[]
  logs: string[]
}

const emergencyStopHotkey = 'Ctrl+Alt+Esc'

const emptyState: MacroState = {
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

const inputClass =
  'h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'
const iconButtonClass =
  'inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
const tableInputClass =
  'h-6 w-full rounded border border-slate-200 bg-white px-1.5 text-[11px] text-slate-900 outline-none transition focus:border-teal-600 focus:ring-1 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500'
const tableIconButtonClass =
  'inline-flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
const primaryButtonClass =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-teal-700 px-2.5 text-xs font-semibold text-white transition hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-45'
const secondaryButtonClass =
  'inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45'

function formatHotkey(value: string): string {
  return value.replace('CommandOrControl', 'Ctrl')
}

function normalizeHotkey(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, '')
    .replace(/^ctrl\+/i, 'CommandOrControl+')
    .replace(/\+ctrl\+/i, '+CommandOrControl+')
}

function acceleratorFromEvent(event: React.KeyboardEvent<HTMLInputElement>): string | null {
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
  event: React.KeyboardEvent<HTMLInputElement>
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

function formatKeyStep(point: Pick<MacroPoint, 'key' | 'modifiers'>): string {
  return [
    ...point.modifiers.map((modifier) => (modifier === 'Control' ? 'Ctrl' : modifier)),
    point.key
  ].join('+')
}

function App(): React.JSX.Element {
  const [state, setState] = useState<MacroState>(emptyState)
  const [draftSettings, setDraftSettings] = useState<MacroSettings>(emptyState.settings)
  const [draftPoints, setDraftPoints] = useState<Record<string, MacroPoint>>({})
  const [profileNameInput, setProfileNameInput] = useState('')
  const [isRenamingProfile, setIsRenamingProfile] = useState(false)
  const [capturingHotkey, setCapturingHotkey] = useState<keyof MacroSettings['hotkeys'] | null>(
    null
  )
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null)
  const [isAddingKeyStep, setIsAddingKeyStep] = useState(false)
  const [capturingPointKeyId, setCapturingPointKeyId] = useState<string | null>(null)
  const [keyDraft, setKeyDraft] = useState<{ key: string; modifiers: MacroPoint['modifiers'] }>({
    key: '',
    modifiers: []
  })
  const [keyStepError, setKeyStepError] = useState('')
  const [logPanelHeight, setLogPanelHeight] = useState(132)
  const profileNameInputRef = useRef<HTMLInputElement | null>(null)
  const isResizingLogRef = useRef(false)
  const resizeStartYRef = useRef(0)
  const resizeStartHeightRef = useRef(132)

  useEffect(() => {
    let disposed = false
    const unsubscribe = window.api.onState((nextState) => {
      if (!disposed) applyState(nextState)
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

    function resizeLogPanel(event: MouseEvent): void {
      if (!isResizingLogRef.current) return
      const delta = resizeStartYRef.current - event.clientY
      const maxHeight = Math.max(180, window.innerHeight - 300)
      const nextHeight = Math.min(maxHeight, Math.max(96, resizeStartHeightRef.current + delta))
      setLogPanelHeight(nextHeight)
    }

    window.addEventListener('mousemove', resizeLogPanel)
    window.addEventListener('mouseup', stopResize)
    return () => {
      window.removeEventListener('mousemove', resizeLogPanel)
      window.removeEventListener('mouseup', stopResize)
    }
  }, [])

  const isEditingLocked = state.isRecording || state.isRunning
  const canStopRecording = state.isRecording

  const status = useMemo(() => {
    if (state.isRunning && state.countdownRemaining > 0) {
      return { label: `${state.countdownRemaining}s 后执行`, tone: 'bg-amber-500' }
    }
    if (state.isRunning) return { label: '执行中', tone: 'bg-emerald-500' }
    if (state.isRecording) return { label: '录制中', tone: 'bg-amber-500' }
    if (state.points.length > 0) return { label: '已配置', tone: 'bg-teal-600' }
    return { label: '待命', tone: 'bg-slate-400' }
  }, [state.countdownRemaining, state.isRecording, state.isRunning, state.points.length])

  const targetLoops =
    state.settings.loopMode === 'infinite' ? '无限' : `${Math.max(1, state.settings.loopCount)}`

  function applyState(nextState: MacroState): void {
    setState(nextState)
    setDraftSettings(nextState.settings)
    setDraftPoints(Object.fromEntries(nextState.points.map((point) => [point.id, point])))
    setProfileNameInput(
      nextState.profiles.find((profile) => profile.id === nextState.activeProfileId)?.name ?? ''
    )
  }

  async function updateState(action: Promise<MacroState>): Promise<void> {
    try {
      applyState(await action)
    } catch (error) {
      console.error('更新应用状态失败', error)
    }
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
      hotkeys: {
        ...current.hotkeys,
        [key]: normalizeHotkey(value)
      }
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

  function updateDraftPoint(id: string, patch: Partial<MacroPoint>): void {
    setDraftPoints((current) => ({
      ...current,
      [id]: {
        ...current[id],
        ...patch
      }
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

  function captureHotkey(
    event: React.KeyboardEvent<HTMLInputElement>,
    key: keyof MacroSettings['hotkeys']
  ): void {
    event.preventDefault()
    const accelerator = acceleratorFromEvent(event)
    if (!accelerator) return
    updateDraftHotkey(key, accelerator)
    stopHotkeyCapture()
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

  function captureKeyStep(event: React.KeyboardEvent<HTMLInputElement>): void {
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

  function capturePointKey(event: React.KeyboardEvent<HTMLInputElement>, pointId: string): void {
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

  function startResizeLogPanel(event: React.MouseEvent<HTMLDivElement>): void {
    isResizingLogRef.current = true
    resizeStartYRef.current = event.clientY
    resizeStartHeightRef.current = logPanelHeight
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
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
      setProfileNameInput(currentName)
      return
    }
    void updateState(window.api.renameProfile(state.activeProfileId, name))
  }

  function cancelRenameProfile(): void {
    setIsRenamingProfile(false)
    setProfileNameInput(
      state.profiles.find((profile) => profile.id === state.activeProfileId)?.name ?? ''
    )
  }

  function deleteActiveProfile(): void {
    if (isEditingLocked || !state.activeProfileId || state.profiles.length <= 1) return
    const currentProfile = state.profiles.find((profile) => profile.id === state.activeProfileId)
    const confirmed = window.confirm(`确定删除方案「${currentProfile?.name ?? '当前方案'}」？`)
    if (!confirmed) return
    void updateState(window.api.deleteProfile(state.activeProfileId))
  }

  return (
    <main className="flex h-screen min-w-[1080px] flex-col gap-2.5 bg-slate-100 p-3 text-slate-900">
      <header className="flex h-10 shrink-0 items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-[10px] font-bold uppercase leading-3 text-slate-500">
              Shree Macro Flow
            </p>
            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-slate-600">
              作者 小踢踢
            </span>
          </div>
          <h1 className="text-lg font-bold leading-5 text-slate-950">自动点击流程台</h1>
        </div>
        <div className="inline-flex h-8 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-bold shadow-sm">
          <span className={`h-2 w-2 rounded-full ${status.tone}`}></span>
          {status.label}
        </div>
      </header>

      <section className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)] gap-3 overflow-hidden">
        <aside className="flex min-h-0 flex-col gap-2.5 overflow-y-auto pr-1">
          <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <Crosshair size={16} />
                控制
              </h2>
              {state.isRecording && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                  采集中
                </span>
              )}
            </div>

            <div className="mb-2 grid grid-cols-2 gap-2 rounded-md bg-slate-50 p-2 text-[11px] text-slate-500">
              <div>
                <p className="font-bold text-slate-700">采集热键</p>
                <p>{formatHotkey(state.settings.hotkeys.capture)}</p>
              </div>
              <div>
                <p className="font-bold text-slate-700">执行轮次</p>
                <p>
                  {state.completedLoops} / {targetLoops}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                className={primaryButtonClass}
                type="button"
                disabled={isEditingLocked}
                onClick={() => updateState(window.api.startRecording())}
              >
                <CircleDot size={14} />
                录制
              </button>
              <button
                className={secondaryButtonClass}
                type="button"
                disabled={!canStopRecording}
                onClick={() => updateState(window.api.stopRecording())}
              >
                <Square size={14} />
                停止录制
              </button>
              <button
                className={primaryButtonClass}
                type="button"
                disabled={isEditingLocked || state.points.length === 0}
                onClick={() => updateState(window.api.startRun())}
              >
                <Play size={14} />
                执行
              </button>
              <button
                className={secondaryButtonClass}
                type="button"
                disabled={!state.isRunning}
                onClick={() => updateState(window.api.stopRun())}
              >
                <Square size={14} />
                停止执行
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <FolderOpen size={16} />
                方案
              </h2>
              <span className="text-[11px] font-semibold text-slate-500">
                {state.profiles.length} 个
              </span>
            </div>

            <div className="grid grid-cols-[1fr_32px] gap-1.5">
              {isRenamingProfile ? (
                <input
                  ref={profileNameInputRef}
                  className={inputClass}
                  disabled={isEditingLocked}
                  placeholder="输入方案名称"
                  value={profileNameInput}
                  onBlur={renameActiveProfile}
                  onChange={(event) => setProfileNameInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') cancelRenameProfile()
                  }}
                />
              ) : (
                <select
                  className={inputClass}
                  disabled={isEditingLocked}
                  value={state.activeProfileId}
                  onChange={(event) => {
                    setIsRenamingProfile(false)
                    updateState(window.api.switchProfile(event.target.value))
                  }}
                >
                  {state.profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              )}
              <button
                aria-label={isRenamingProfile ? '保存方案名称' : '重命名方案'}
                className={iconButtonClass}
                disabled={isEditingLocked || !state.activeProfileId}
                title={isRenamingProfile ? '保存方案名称' : '重命名方案'}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  if (isRenamingProfile) renameActiveProfile()
                  else setIsRenamingProfile(true)
                }}
              >
                <Pencil size={14} />
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5">
              <button
                className={secondaryButtonClass}
                type="button"
                disabled={isEditingLocked}
                onClick={createProfile}
              >
                <Plus size={14} />
                新建
              </button>
              <button
                className={secondaryButtonClass}
                type="button"
                disabled={isEditingLocked || state.profiles.length <= 1}
                onClick={deleteActiveProfile}
              >
                <Trash2 size={14} />
                删除
              </button>
            </div>

            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <button
                className={secondaryButtonClass}
                type="button"
                disabled={isEditingLocked}
                onClick={() => updateState(window.api.importProfile())}
              >
                <Upload size={14} />
                导入
              </button>
              <button
                className={secondaryButtonClass}
                type="button"
                disabled={isEditingLocked || !state.activeProfileId}
                onClick={() => updateState(window.api.exportProfile(state.activeProfileId))}
              >
                <Download size={14} />
                导出
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
              <Settings size={16} />
              配置
            </h2>
            <div className="grid grid-cols-2 gap-2">
              <label className="col-span-2 grid gap-1">
                <span className="text-[11px] font-bold text-slate-500">默认点击间隔 s</span>
                <div className="grid grid-cols-[1fr_64px] gap-2">
                  <input
                    className={inputClass}
                    disabled={isEditingLocked}
                    min="0.1"
                    step="0.1"
                    type="number"
                    value={draftSettings.clickIntervalSeconds}
                    onChange={(event) =>
                      updateDraftNumber('clickIntervalSeconds', event.target.value)
                    }
                  />
                  <button
                    className={secondaryButtonClass}
                    type="button"
                    disabled={isEditingLocked || state.points.length === 0}
                    onClick={() => void syncDefaultDelayToPoints()}
                  >
                    同步
                  </button>
                </div>
              </label>

              <label className="grid gap-1">
                <span className="text-[11px] font-bold text-slate-500">循环间隔 s</span>
                <input
                  className={inputClass}
                  disabled={isEditingLocked}
                  min="0"
                  step="0.1"
                  type="number"
                  value={draftSettings.loopIntervalSeconds}
                  onChange={(event) => updateDraftNumber('loopIntervalSeconds', event.target.value)}
                />
              </label>

              <label className="grid gap-1">
                <span className="text-[11px] font-bold text-slate-500">倒计时 s</span>
                <input
                  className={inputClass}
                  disabled={isEditingLocked}
                  min="0"
                  step="1"
                  type="number"
                  value={draftSettings.startDelaySeconds}
                  onChange={(event) => updateDraftNumber('startDelaySeconds', event.target.value)}
                />
              </label>

              <label className="grid gap-1">
                <span className="text-[11px] font-bold text-slate-500">循环模式</span>
                <select
                  className={inputClass}
                  disabled={isEditingLocked}
                  value={draftSettings.loopMode}
                  onChange={(event) =>
                    setDraftSettings((current) => ({
                      ...current,
                      loopMode: event.target.value === 'infinite' ? 'infinite' : 'count'
                    }))
                  }
                >
                  <option value="count">指定次数</option>
                  <option value="infinite">无限循环</option>
                </select>
              </label>

              <label className="grid gap-1">
                <span className="text-[11px] font-bold text-slate-500">循环次数</span>
                <input
                  className={inputClass}
                  disabled={isEditingLocked || draftSettings.loopMode === 'infinite'}
                  min="1"
                  step="1"
                  type="number"
                  value={draftSettings.loopCount}
                  onChange={(event) => updateDraftNumber('loopCount', event.target.value)}
                />
              </label>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              {(
                [
                  ['capture', '采集坐标'],
                  ['start', '开始执行'],
                  ['stop', '停止执行']
                ] as Array<[keyof MacroSettings['hotkeys'], string]>
              ).map(([key, label]) => (
                <label className="grid gap-1" key={key}>
                  <span className="text-[11px] font-bold text-slate-500">{label}</span>
                  <input
                    readOnly
                    className={`${inputClass} ${capturingHotkey === key ? 'border-amber-400 bg-amber-50' : ''}`}
                    disabled={isEditingLocked}
                    value={
                      capturingHotkey === key
                        ? '请按组合键...'
                        : formatHotkey(draftSettings.hotkeys[key])
                    }
                    onFocus={() => startHotkeyCapture(key)}
                    onBlur={stopHotkeyCapture}
                    onKeyDown={(event) => captureHotkey(event, key)}
                  />
                </label>
              ))}
            </div>

            {state.hotkeyErrors.length > 0 && (
              <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 p-2">
                {state.hotkeyErrors.map((item) => (
                  <p className="text-xs leading-5 text-rose-700" key={item}>
                    {item}
                  </p>
                ))}
              </div>
            )}

            <button
              className={`${primaryButtonClass} mt-2 w-full`}
              type="button"
              disabled={isEditingLocked}
              onClick={() => updateState(window.api.updateSettings(draftSettings))}
            >
              <Save size={16} />
              保存配置
            </button>
          </section>
        </aside>

        <section className="flex min-h-0 flex-col">
          <section className="flex min-h-[180px] flex-1 flex-col rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2.5">
              <div>
                <h2 className="flex items-center gap-2 text-sm font-bold">
                  <ListChecks size={16} />
                  流程步骤
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {state.points.length} 个步骤，拖拽话柄调整顺序
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className={secondaryButtonClass}
                  type="button"
                  disabled={isEditingLocked}
                  onClick={openKeyStepEditor}
                >
                  <Keyboard size={14} />
                  添加按键
                </button>
                <button
                  className={secondaryButtonClass}
                  type="button"
                  disabled={isEditingLocked || state.points.length === 0}
                  onClick={() => updateState(window.api.clearPoints())}
                >
                  <Trash2 size={14} />
                  清空
                </button>
              </div>
            </div>

            {isAddingKeyStep && (
              <div className="border-b border-teal-100 bg-teal-50 px-3 py-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-teal-900">
                  <Keyboard size={15} /> 添加键盘按键步骤
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    autoFocus
                    readOnly
                    aria-label="录制键盘按键"
                    className={`${inputClass} ${keyStepError ? 'border-rose-400' : 'border-teal-400 bg-white'}`}
                    value={keyDraft.key ? formatKeyStep(keyDraft) : '请按组合键，Esc 取消'}
                    onKeyDown={captureKeyStep}
                  />
                  <button className={primaryButtonClass} type="button" onClick={saveKeyStep}>
                    保存
                  </button>
                  <button
                    className={secondaryButtonClass}
                    type="button"
                    onClick={closeKeyStepEditor}
                  >
                    取消
                  </button>
                </div>
                <p
                  className={`mt-1 text-[11px] ${keyStepError ? 'text-rose-700' : 'text-teal-700'}`}
                >
                  {keyStepError ||
                    '支持单键和 Ctrl、Alt、Shift 组合键；运行时会发送到当前前台窗口。'}
                </p>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto">
              {state.points.length === 0 ? (
                <div className="m-4 flex min-h-72 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
                  暂无流程步骤
                </div>
              ) : (
                <div className="min-w-[860px]">
                  <div className="sticky top-0 z-10 grid grid-cols-[64px_minmax(150px,1.2fr)_92px_minmax(180px,1fr)_96px_84px] items-center border-b border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-500">
                    <span>序号</span>
                    <span>名称</span>
                    <span>动作</span>
                    <span>参数</span>
                    <span>等待 s</span>
                    <span className="text-right">操作</span>
                  </div>

                  <div>
                    {state.points.map((point, index) => {
                      const draft = draftPoints[point.id] ?? point
                      return (
                        <div
                          className={`grid grid-cols-[64px_minmax(150px,1.2fr)_92px_minmax(180px,1fr)_96px_84px] items-center gap-1.5 border-b border-slate-100 px-2.5 py-1 transition ${
                            state.currentIndex === index
                              ? 'bg-teal-50 ring-1 ring-inset ring-teal-200'
                              : draggingPointId === point.id
                                ? 'bg-slate-100'
                                : 'bg-white hover:bg-slate-50'
                          }`}
                          key={point.id}
                          onDragOver={(event) => {
                            if (!isEditingLocked) event.preventDefault()
                          }}
                          onDrop={() => dropPoint(index)}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              aria-label="拖拽排序"
                              className="inline-flex h-6 w-6 cursor-grab items-center justify-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                              disabled={isEditingLocked}
                              draggable={!isEditingLocked}
                              type="button"
                              onDragEnd={() => setDraggingPointId(null)}
                              onDragStart={(event) => {
                                setDraggingPointId(point.id)
                                event.dataTransfer.effectAllowed = 'move'
                              }}
                            >
                              <GripVertical size={16} />
                            </button>
                            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-slate-100 px-1.5 text-[10px] font-bold text-slate-600">
                              {index + 1}
                            </span>
                          </div>

                          <input
                            aria-label="步骤名称"
                            className={tableInputClass}
                            disabled={isEditingLocked}
                            value={draft.label}
                            onBlur={() => savePoint(point.id)}
                            onChange={(event) =>
                              updateDraftPoint(point.id, { label: event.target.value })
                            }
                          />

                          <span
                            className={`inline-flex w-fit rounded px-2 py-1 text-[10px] font-bold ${point.action === 'key' ? 'bg-violet-100 text-violet-700' : 'bg-sky-100 text-sky-700'}`}
                          >
                            {point.action === 'key' ? '键盘按键' : '鼠标点击'}
                          </span>

                          {point.action === 'key' ? (
                            <input
                              readOnly
                              aria-label="键盘按键"
                              className={`${tableInputClass} font-mono font-semibold ${capturingPointKeyId === point.id ? 'border-violet-400 bg-violet-50' : ''}`}
                              disabled={isEditingLocked}
                              value={
                                capturingPointKeyId === point.id
                                  ? '请按组合键...'
                                  : formatKeyStep(point)
                              }
                              onBlur={() => {
                                setCapturingPointKeyId(null)
                                void window.api.setKeyCapture(false)
                              }}
                              onFocus={() => {
                                setCapturingPointKeyId(point.id)
                                void window.api.setKeyCapture(true)
                              }}
                              onKeyDown={(event) => capturePointKey(event, point.id)}
                            />
                          ) : (
                            <div className="grid grid-cols-2 gap-1.5">
                              <input
                                aria-label="X 坐标"
                                className={tableInputClass}
                                disabled={isEditingLocked}
                                type="number"
                                value={draft.x}
                                onBlur={() => savePoint(point.id)}
                                onChange={(event) =>
                                  updateDraftPoint(point.id, { x: Number(event.target.value) || 0 })
                                }
                              />
                              <input
                                aria-label="Y 坐标"
                                className={tableInputClass}
                                disabled={isEditingLocked}
                                type="number"
                                value={draft.y}
                                onBlur={() => savePoint(point.id)}
                                onChange={(event) =>
                                  updateDraftPoint(point.id, { y: Number(event.target.value) || 0 })
                                }
                              />
                            </div>
                          )}

                          <input
                            aria-label="步骤后等待秒数"
                            className={tableInputClass}
                            disabled={isEditingLocked}
                            min="0.1"
                            step="0.1"
                            type="number"
                            value={draft.delaySeconds}
                            onBlur={() => savePoint(point.id)}
                            onChange={(event) =>
                              updateDraftPoint(point.id, {
                                delaySeconds: Math.max(0.1, Number(event.target.value) || 0.1)
                              })
                            }
                          />

                          <div className="flex justify-end gap-2">
                            {point.action === 'click' && (
                              <button
                                aria-label="测试点击"
                                className={tableIconButtonClass}
                                disabled={isEditingLocked}
                                title="测试点击"
                                type="button"
                                onClick={() => updateState(window.api.testPoint(point.id))}
                              >
                                <MousePointerClick size={14} />
                              </button>
                            )}
                            <button
                              aria-label="删除步骤"
                              className={tableIconButtonClass}
                              disabled={isEditingLocked}
                              title="删除"
                              type="button"
                              onClick={() => updateState(window.api.removePoint(point.id))}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </section>

          <div
            aria-label="调整日志高度"
            className="group flex h-3 shrink-0 cursor-row-resize items-center justify-center"
            role="separator"
            onMouseDown={startResizeLogPanel}
          >
            <div className="h-1 w-12 rounded-full bg-slate-300 transition group-hover:bg-teal-500"></div>
          </div>

          <section
            className="flex min-h-[96px] shrink-0 flex-col rounded-lg border border-slate-200 bg-white shadow-sm"
            style={{ height: logPanelHeight }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-3 py-2">
              <h2 className="flex items-center gap-2 text-sm font-bold">
                <ScrollText size={16} />
                执行日志
              </h2>
              <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
                <span className="flex items-center gap-1">
                  <TimerReset size={14} />
                  倒计时 {state.countdownRemaining}s
                </span>
                <span className="flex items-center gap-1 text-rose-700">
                  <ShieldAlert size={14} />
                  {emergencyStopHotkey}
                </span>
                <button
                  className={tableIconButtonClass}
                  disabled={state.logs.length === 0}
                  title="清空日志"
                  type="button"
                  onClick={() => updateState(window.api.clearLogs())}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-slate-950 p-2.5">
              {state.logs.length === 0 ? (
                <p className="font-mono text-xs text-slate-400">暂无日志。</p>
              ) : (
                state.logs.map((item) => (
                  <p className="font-mono text-xs leading-6 text-sky-100" key={item}>
                    {item}
                  </p>
                ))
              )}
            </div>
          </section>
        </section>
      </section>
    </main>
  )
}

export default App
