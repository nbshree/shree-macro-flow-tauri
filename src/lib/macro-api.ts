import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export type MacroPointAction = 'click' | 'doubleClick' | 'key'

export type MacroPoint = {
  id: string
  label: string
  action: MacroPointAction
  enabled: boolean
  x: number
  y: number
  key: string
  modifiers: Array<'Control' | 'Alt' | 'Shift'>
  delaySeconds: number
  createdAt: number
}

export type MacroPointPatch = Partial<
  Pick<
    MacroPoint,
    'label' | 'action' | 'enabled' | 'x' | 'y' | 'key' | 'modifiers' | 'delaySeconds'
  >
>

export type MacroSettings = {
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

export type AppearancePreferences = {
  themeId: string
  cleanMode: boolean
}

export type MysteryCodeStatus = {
  configured: boolean
  lastFour: string | null
  baseUrl: string
  apiKeyConfigured?: boolean
  apiKeyLastFour?: string | null
  model?: string
}

export type InternalSkillRecognitionResult = {
  baseStats: {
    season: number
    strengthOrQi: number
    attack: number
    armorPenetration: number
    factionRestraint: number
    criticalHit: number
    maxAttack: number
    minAttack: number
    agility: number
    endurance: number
    constitution: number
  }
  equippedSkillIds: string[]
}

export type MacroState = {
  points: MacroPoint[]
  settings: MacroSettings
  appearance: AppearancePreferences
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

export type WindowResizeDirection =
  'East' | 'North' | 'NorthEast' | 'NorthWest' | 'South' | 'SouthEast' | 'SouthWest' | 'West'

export type WindowSize = {
  width: number
  height: number
}

export type WindowControlsAPI = {
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  isMaximized: () => Promise<boolean>
  close: () => Promise<void>
  startDragging: () => Promise<void>
  startResizeDragging: (direction: WindowResizeDirection) => Promise<void>
  onResized: (callback: (size: WindowSize) => void) => () => void
}

export type MacroAPI = {
  getState: () => Promise<MacroState>
  startRecording: () => Promise<MacroState>
  stopRecording: () => Promise<MacroState>
  startRun: () => Promise<MacroState>
  stopRun: () => Promise<MacroState>
  clearLogs: () => Promise<MacroState>
  removePoint: (id: string) => Promise<MacroState>
  clearPoints: () => Promise<MacroState>
  addKeyPoint: (key: string, modifiers: MacroPoint['modifiers']) => Promise<MacroState>
  setKeyCapture: (enabled: boolean) => Promise<void>
  syncPointDelays: () => Promise<MacroState>
  updatePoint: (id: string, patch: MacroPointPatch) => Promise<MacroState>
  movePoint: (id: string, direction: 'up' | 'down') => Promise<MacroState>
  reorderPoint: (id: string, targetIndex: number) => Promise<MacroState>
  testPoint: (id: string) => Promise<MacroState>
  updateSettings: (settings: Partial<MacroSettings>) => Promise<MacroState>
  updateAppearance: (appearance: Partial<AppearancePreferences>) => Promise<MacroState>
  createProfile: (name: string) => Promise<MacroState>
  switchProfile: (id: string) => Promise<MacroState>
  renameProfile: (id: string, name: string) => Promise<MacroState>
  deleteProfile: (id: string) => Promise<MacroState>
  exportProfile: (id: string) => Promise<MacroState>
  importProfile: () => Promise<MacroState>
  getMysteryCodeStatus: () => Promise<MysteryCodeStatus>
  openAiProviderRegistration: () => Promise<void>
  saveAndValidateMysteryCode: (
    mysteryCode: string,
    baseUrl: string,
    apiKey: string,
    model: string
  ) => Promise<MysteryCodeStatus>
  deleteMysteryCode: () => Promise<MysteryCodeStatus>
  recognizeInternalSkillImage: (imageDataUrl: string) => Promise<InternalSkillRecognitionResult>
  onState: (callback: (state: MacroState) => void) => () => void
  window: WindowControlsAPI
}

type StateCommand =
  | 'get_state'
  | 'start_recording'
  | 'stop_recording'
  | 'start_run'
  | 'stop_run'
  | 'clear_logs'
  | 'remove_point'
  | 'clear_points'
  | 'add_key_point'
  | 'sync_point_delays'
  | 'update_point'
  | 'move_point'
  | 'reorder_point'
  | 'test_point'
  | 'update_settings'
  | 'update_appearance'
  | 'create_profile'
  | 'switch_profile'
  | 'rename_profile'
  | 'delete_profile'
  | 'export_profile'
  | 'import_profile'

function invokeState(command: StateCommand, args?: Record<string, unknown>): Promise<MacroState> {
  return callTauri(() => invoke<MacroState>(command, args))
}

function callTauri<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return operation()
  } catch (error) {
    return Promise.reject(error)
  }
}

const windowControls: WindowControlsAPI = {
  minimize: () => callTauri(() => getCurrentWindow().minimize()),
  toggleMaximize: () => callTauri(() => getCurrentWindow().toggleMaximize()),
  isMaximized: () => callTauri(() => getCurrentWindow().isMaximized()),
  close: () => callTauri(() => getCurrentWindow().close()),
  startDragging: () => callTauri(() => getCurrentWindow().startDragging()),
  startResizeDragging: (direction) =>
    callTauri(() => getCurrentWindow().startResizeDragging(direction)),
  onResized: (callback) => {
    let disposed = false
    let unlisten: UnlistenFn | undefined

    void callTauri(() =>
      getCurrentWindow().onResized(({ payload }) => {
        if (!disposed) callback({ width: payload.width, height: payload.height })
      })
    )
      .then((nextUnlisten) => {
        if (disposed) nextUnlisten()
        else unlisten = nextUnlisten
      })
      .catch((error: unknown) => {
        if (!disposed) console.error('监听窗口尺寸变化失败', error)
      })

    return () => {
      disposed = true
      unlisten?.()
      unlisten = undefined
    }
  }
}

export const macroApi: MacroAPI = {
  getState: () => invokeState('get_state'),
  startRecording: () => invokeState('start_recording'),
  stopRecording: () => invokeState('stop_recording'),
  startRun: () => invokeState('start_run'),
  stopRun: () => invokeState('stop_run'),
  clearLogs: () => invokeState('clear_logs'),
  removePoint: (id) => invokeState('remove_point', { id }),
  clearPoints: () => invokeState('clear_points'),
  addKeyPoint: (key, modifiers) => invokeState('add_key_point', { key, modifiers }),
  setKeyCapture: (enabled) => callTauri(() => invoke<void>('set_key_capture', { enabled })),
  syncPointDelays: () => invokeState('sync_point_delays'),
  updatePoint: (id, patch) => invokeState('update_point', { id, patch }),
  movePoint: (id, direction) => invokeState('move_point', { id, direction }),
  reorderPoint: (id, targetIndex) => invokeState('reorder_point', { id, targetIndex }),
  testPoint: (id) => invokeState('test_point', { id }),
  updateSettings: (settings) => invokeState('update_settings', { settings }),
  updateAppearance: (appearance) => invokeState('update_appearance', { appearance }),
  createProfile: (name) => invokeState('create_profile', { name }),
  switchProfile: (id) => invokeState('switch_profile', { id }),
  renameProfile: (id, name) => invokeState('rename_profile', { id, name }),
  deleteProfile: (id) => invokeState('delete_profile', { id }),
  exportProfile: (id) => invokeState('export_profile', { id }),
  importProfile: () => invokeState('import_profile'),
  getMysteryCodeStatus: () => callTauri(() => invoke<MysteryCodeStatus>('get_mystery_code_status')),
  openAiProviderRegistration: () =>
    callTauri(() => invoke<void>('open_ai_provider_registration')),
  saveAndValidateMysteryCode: (mysteryCode, baseUrl, apiKey, model) =>
    callTauri(() =>
      invoke<MysteryCodeStatus>('save_and_validate_mystery_code', {
        mysteryCode,
        baseUrl,
        apiKey,
        model
      })
    ),
  deleteMysteryCode: () => callTauri(() => invoke<MysteryCodeStatus>('delete_mystery_code')),
  recognizeInternalSkillImage: (imageDataUrl) =>
    callTauri(() =>
      invoke<InternalSkillRecognitionResult>('recognize_internal_skill_image', { imageDataUrl })
    ),
  onState: (callback) => {
    let disposed = false
    let unlisten: UnlistenFn | undefined

    void callTauri(() =>
      listen<MacroState>('macro-state', (event) => {
        if (!disposed) callback(event.payload)
      })
    )
      .then((nextUnlisten) => {
        if (disposed) nextUnlisten()
        else unlisten = nextUnlisten
      })
      .catch((error: unknown) => {
        if (!disposed) console.error('监听 macro-state 事件失败', error)
      })

    return () => {
      disposed = true
      unlisten?.()
      unlisten = undefined
    }
  },
  window: windowControls
}

window.api = macroApi
