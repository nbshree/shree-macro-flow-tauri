import { render, type RenderOptions } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { vi } from 'vitest'

import { TooltipProvider } from '@/components/ui/tooltip'
import { emptyState, type MacroController } from '@/hooks/useMacroController'
import type { MacroAPI, MacroPointPatch, MacroState } from '@/lib/macro-api'

export function createMacroState(overrides: Partial<MacroState> = {}): MacroState {
  const state: MacroState = {
    ...emptyState,
    points: emptyState.points.map((point) => ({ ...point, modifiers: [...point.modifiers] })),
    settings: {
      ...emptyState.settings,
      hotkeys: { ...emptyState.settings.hotkeys }
    },
    appearance: { ...emptyState.appearance },
    profiles: emptyState.profiles.map((profile) => ({ ...profile })),
    hotkeyErrors: [...emptyState.hotkeyErrors],
    logs: [...emptyState.logs]
  }

  return {
    ...state,
    ...overrides,
    settings: overrides.settings
      ? {
          ...state.settings,
          ...overrides.settings,
          hotkeys: { ...state.settings.hotkeys, ...overrides.settings.hotkeys }
        }
      : state.settings,
    appearance: { ...state.appearance, ...overrides.appearance },
    points: overrides.points ?? state.points,
    profiles: overrides.profiles ?? state.profiles,
    hotkeyErrors: overrides.hotkeyErrors ?? state.hotkeyErrors,
    logs: overrides.logs ?? state.logs
  }
}

export function createMacroController(overrides: Partial<MacroController> = {}): MacroController {
  const state = overrides.state ?? createMacroState()
  const draftSettings = overrides.draftSettings ?? {
    ...state.settings,
    hotkeys: { ...state.settings.hotkeys }
  }
  const enabledPointCount =
    overrides.enabledPointCount ?? state.points.filter((point) => point.enabled).length

  const controller: MacroController = {
    state,
    draftSettings,
    setDraftSettings: vi.fn<MacroController['setDraftSettings']>(),
    draftPoints: {},
    profileNameInput: '',
    setProfileNameInput: vi.fn<MacroController['setProfileNameInput']>(),
    isRenamingProfile: false,
    setIsRenamingProfile: vi.fn<MacroController['setIsRenamingProfile']>(),
    capturingHotkey: null,
    draggingPointId: null,
    setDraggingPointId: vi.fn<MacroController['setDraggingPointId']>(),
    isAddingKeyStep: false,
    capturingPointKeyId: null,
    setCapturingPointKeyId: vi.fn<MacroController['setCapturingPointKeyId']>(),
    keyDraft: { key: '', modifiers: [] },
    keyStepError: '',
    logPanelHeight: 140,
    logPanelMaxHeight: 420,
    profileNameInputRef: { current: null },
    isEditingLocked: false,
    canStopRecording: false,
    enabledPointCount,
    status: { label: '待命', tone: 'muted' },
    targetLoops: state.settings.loopMode === 'infinite' ? '无限' : String(state.settings.loopCount),
    updateState: vi.fn<MacroController['updateState']>().mockResolvedValue(undefined),
    updateAppearance: vi.fn<MacroController['updateAppearance']>().mockResolvedValue(undefined),
    updateDraftNumber: vi.fn<MacroController['updateDraftNumber']>(),
    startHotkeyCapture: vi.fn<MacroController['startHotkeyCapture']>(),
    stopHotkeyCapture: vi.fn<MacroController['stopHotkeyCapture']>(),
    captureHotkey: vi.fn<MacroController['captureHotkey']>(),
    updateDraftPoint: vi.fn<MacroController['updateDraftPoint']>(),
    updatePoint: vi.fn<MacroController['updatePoint']>().mockResolvedValue(undefined),
    savePoint: vi.fn<MacroController['savePoint']>(),
    syncDefaultDelayToPoints: vi
      .fn<MacroController['syncDefaultDelayToPoints']>()
      .mockResolvedValue(undefined),
    closeKeyStepEditor: vi.fn<MacroController['closeKeyStepEditor']>(),
    openKeyStepEditor: vi.fn<MacroController['openKeyStepEditor']>(),
    captureKeyStep: vi.fn<MacroController['captureKeyStep']>(),
    saveKeyStep: vi.fn<MacroController['saveKeyStep']>(),
    capturePointKey: vi.fn<MacroController['capturePointKey']>(),
    dropPoint: vi.fn<MacroController['dropPoint']>(),
    startResizeLogPanel: vi.fn<MacroController['startResizeLogPanel']>(),
    resizeLogPanelBy: vi.fn<MacroController['resizeLogPanelBy']>(),
    createProfile: vi.fn<MacroController['createProfile']>(),
    renameActiveProfile: vi.fn<MacroController['renameActiveProfile']>(),
    cancelRenameProfile: vi.fn<MacroController['cancelRenameProfile']>(),
    removeActiveProfile: vi.fn<MacroController['removeActiveProfile']>()
  }

  return { ...controller, ...overrides, state, draftSettings, enabledPointCount }
}

export function createMacroApi(state: MacroState = createMacroState()) {
  return {
    getState: vi.fn(async () => state),
    startRecording: vi.fn(async () => state),
    stopRecording: vi.fn(async () => state),
    startRun: vi.fn(async () => state),
    stopRun: vi.fn(async () => state),
    clearLogs: vi.fn(async () => state),
    removePoint: vi.fn(async (_id: string) => state),
    clearPoints: vi.fn(async () => state),
    addKeyPoint: vi.fn(
      async (_key: string, _modifiers: MacroState['points'][number]['modifiers']) => state
    ),
    setKeyCapture: vi.fn(async (_enabled: boolean) => undefined),
    syncPointDelays: vi.fn(async () => state),
    updatePoint: vi.fn(async (_id: string, _patch: MacroPointPatch) => state),
    movePoint: vi.fn(async (_id: string, _direction: 'up' | 'down') => state),
    reorderPoint: vi.fn(async (_id: string, _targetIndex: number) => state),
    testPoint: vi.fn(async (_id: string) => state),
    updateSettings: vi.fn(async (_settings: Partial<MacroState['settings']>) => state),
    updateAppearance: vi.fn(async (_appearance: Partial<MacroState['appearance']>) => state),
    createProfile: vi.fn(async (_name: string) => state),
    switchProfile: vi.fn(async (_id: string) => state),
    renameProfile: vi.fn(async (_id: string, _name: string) => state),
    deleteProfile: vi.fn(async (_id: string) => state),
    exportProfile: vi.fn(async (_id: string) => state),
    importProfile: vi.fn(async () => state),
    onState: vi.fn((_callback: (nextState: MacroState) => void) => () => undefined),
    window: {
      minimize: vi.fn(async () => undefined),
      toggleMaximize: vi.fn(async () => undefined),
      isMaximized: vi.fn(async () => false),
      close: vi.fn(async () => undefined),
      startDragging: vi.fn(async () => undefined),
      startResizeDragging: vi.fn(async () => undefined),
      onResized: vi.fn(() => () => undefined)
    }
  } satisfies MacroAPI
}

export function installMacroApi(api: MacroAPI): void {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: api,
    writable: true
  })
}

function UiProviders({ children }: { children: ReactNode }) {
  return <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
}

export function renderWithUiProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: UiProviders, ...options })
}
