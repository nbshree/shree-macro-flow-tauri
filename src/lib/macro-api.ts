import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export type MacroPoint = {
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

export type MacroState = {
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
  updatePoint: (id: string, patch: Partial<MacroPoint>) => Promise<MacroState>
  movePoint: (id: string, direction: 'up' | 'down') => Promise<MacroState>
  reorderPoint: (id: string, targetIndex: number) => Promise<MacroState>
  testPoint: (id: string) => Promise<MacroState>
  updateSettings: (settings: Partial<MacroSettings>) => Promise<MacroState>
  createProfile: (name: string) => Promise<MacroState>
  switchProfile: (id: string) => Promise<MacroState>
  renameProfile: (id: string, name: string) => Promise<MacroState>
  deleteProfile: (id: string) => Promise<MacroState>
  exportProfile: (id: string) => Promise<MacroState>
  importProfile: () => Promise<MacroState>
  onState: (callback: (state: MacroState) => void) => () => void
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
  | 'create_profile'
  | 'switch_profile'
  | 'rename_profile'
  | 'delete_profile'
  | 'export_profile'
  | 'import_profile'

function invokeState(command: StateCommand, args?: Record<string, unknown>): Promise<MacroState> {
  return invoke<MacroState>(command, args)
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
  setKeyCapture: (enabled) => invoke<void>('set_key_capture', { enabled }),
  syncPointDelays: () => invokeState('sync_point_delays'),
  updatePoint: (id, patch) => invokeState('update_point', { id, patch }),
  movePoint: (id, direction) => invokeState('move_point', { id, direction }),
  reorderPoint: (id, targetIndex) => invokeState('reorder_point', { id, targetIndex }),
  testPoint: (id) => invokeState('test_point', { id }),
  updateSettings: (settings) => invokeState('update_settings', { settings }),
  createProfile: (name) => invokeState('create_profile', { name }),
  switchProfile: (id) => invokeState('switch_profile', { id }),
  renameProfile: (id, name) => invokeState('rename_profile', { id, name }),
  deleteProfile: (id) => invokeState('delete_profile', { id }),
  exportProfile: (id) => invokeState('export_profile', { id }),
  importProfile: () => invokeState('import_profile'),
  onState: (callback) => {
    let disposed = false
    let unlisten: UnlistenFn | undefined

    void listen<MacroState>('macro-state', (event) => {
      if (!disposed) callback(event.payload)
    })
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
  }
}

window.api = macroApi
