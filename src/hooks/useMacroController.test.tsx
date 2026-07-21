import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MacroAPI, MacroPointPatch, MacroState } from '../lib/macro-api'
import { emptyState, useMacroController } from './useMacroController'

function createState(): MacroState {
  return {
    ...emptyState,
    points: [],
    settings: {
      ...emptyState.settings,
      hotkeys: { ...emptyState.settings.hotkeys }
    },
    appearance: { ...emptyState.appearance },
    activeProfileId: 'profile-1',
    profiles: [{ id: 'profile-1', name: '默认方案', updatedAt: 1 }],
    hotkeyErrors: [],
    logs: []
  }
}

function installMacroApi(initialState: MacroState) {
  let currentState = initialState
  let stateListener: ((state: MacroState) => void) | undefined

  const api = {
    getState: vi.fn().mockResolvedValue(currentState),
    onState: vi.fn((listener: (state: MacroState) => void) => {
      stateListener = listener
      return () => {
        stateListener = undefined
      }
    }),
    setKeyCapture: vi.fn().mockResolvedValue(undefined),
    updateAppearance: vi.fn(async (appearance: MacroState['appearance']) => {
      currentState = {
        ...currentState,
        appearance: { ...currentState.appearance, ...appearance }
      }
      stateListener?.(currentState)
      return currentState
    }),
    updatePoint: vi.fn(async (id: string, patch: MacroPointPatch) => {
      currentState = {
        ...currentState,
        points: currentState.points.map((point) =>
          point.id === id ? { ...point, ...patch } : point
        )
      }
      stateListener?.(currentState)
      return currentState
    })
  } as unknown as MacroAPI

  Object.defineProperty(window, 'api', {
    configurable: true,
    value: api,
    writable: true
  })

  return api
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useMacroController', () => {
  it('preserves unsaved drafts when appearance state is broadcast and applied', async () => {
    const initialState = createState()
    initialState.points = [
      {
        id: 'point-1',
        label: '原步骤',
        action: 'click',
        enabled: true,
        x: 10,
        y: 20,
        key: '',
        modifiers: [],
        delaySeconds: 0.5,
        createdAt: 1
      }
    ]
    const api = installMacroApi(initialState)
    const { result, unmount } = renderHook(() => useMacroController())

    await waitFor(() => expect(result.current.state.activeProfileId).toBe('profile-1'))

    act(() => {
      result.current.setDraftSettings((current) => ({
        ...current,
        clickIntervalSeconds: 2.5
      }))
      result.current.updateDraftPoint('point-1', { label: '未保存步骤名' })
      result.current.setProfileNameInput('未保存方案名')
    })

    await act(async () => {
      await result.current.updateAppearance({ themeId: 'default' })
    })

    expect(api.updateAppearance).toHaveBeenCalledWith({ themeId: 'default' })
    expect(result.current.state.appearance.themeId).toBe('default')
    expect(result.current.draftSettings.clickIntervalSeconds).toBe(2.5)
    expect(result.current.draftPoints['point-1'].label).toBe('未保存步骤名')
    expect(result.current.profileNameInput).toBe('未保存方案名')

    unmount()
  })

  it('preserves dirty drafts when an enabled or action patch is applied immediately', async () => {
    const initialState = createState()
    initialState.points = [
      {
        id: 'point-1',
        label: '原步骤一',
        action: 'click',
        enabled: true,
        x: 10,
        y: 20,
        key: '',
        modifiers: [],
        delaySeconds: 0.5,
        createdAt: 1
      },
      {
        id: 'point-2',
        label: '原步骤二',
        action: 'click',
        enabled: true,
        x: 30,
        y: 40,
        key: '',
        modifiers: [],
        delaySeconds: 0.5,
        createdAt: 2
      }
    ]
    const api = installMacroApi(initialState)
    const { result, unmount } = renderHook(() => useMacroController())

    await waitFor(() => expect(result.current.state.points).toHaveLength(2))

    act(() => {
      result.current.setDraftSettings((current) => ({
        ...current,
        loopIntervalSeconds: 2.5
      }))
      result.current.updateDraftPoint('point-1', { label: '未保存步骤一' })
      result.current.updateDraftPoint('point-2', { delaySeconds: 3.5 })
    })

    await act(async () => {
      await result.current.updatePoint('point-1', {
        action: 'doubleClick',
        enabled: false
      })
    })

    expect(api.updatePoint).toHaveBeenCalledWith('point-1', {
      action: 'doubleClick',
      enabled: false
    })
    expect(result.current.state.points[0]).toMatchObject({
      action: 'doubleClick',
      enabled: false
    })
    expect(result.current.draftSettings.loopIntervalSeconds).toBe(2.5)
    expect(result.current.draftPoints['point-1']).toMatchObject({
      label: '未保存步骤一',
      action: 'doubleClick',
      enabled: false
    })
    expect(result.current.draftPoints['point-2'].delaySeconds).toBe(3.5)

    unmount()
  })

  it('reports all-disabled status and enabled point count', async () => {
    const initialState = createState()
    initialState.points = [
      {
        id: 'point-1',
        label: '禁用步骤',
        action: 'click',
        enabled: false,
        x: 10,
        y: 20,
        key: '',
        modifiers: [],
        delaySeconds: 0.5,
        createdAt: 1
      }
    ]
    installMacroApi(initialState)
    const { result, unmount } = renderHook(() => useMacroController())

    await waitFor(() => expect(result.current.state.points).toHaveLength(1))

    expect(result.current.enabledPointCount).toBe(0)
    expect(result.current.status).toEqual({ label: '全部禁用', tone: 'muted' })

    unmount()
  })

  it('reports unsaved settings and point edits', async () => {
    const initialState = createState()
    initialState.points = [
      {
        id: 'point-1',
        label: '原步骤',
        action: 'click',
        enabled: true,
        x: 10,
        y: 20,
        key: '',
        modifiers: [],
        delaySeconds: 0.5,
        createdAt: 1
      }
    ]
    installMacroApi(initialState)
    const { result, unmount } = renderHook(() => useMacroController())

    await waitFor(() => expect(result.current.state.points).toHaveLength(1))
    expect(result.current.hasUnsavedChanges).toBe(false)

    act(() => {
      result.current.setDraftSettings((current) => ({
        ...current,
        clickIntervalSeconds: 3
      }))
    })
    expect(result.current.hasUnsavedChanges).toBe(true)

    act(() => {
      result.current.setDraftSettings(result.current.state.settings)
      result.current.updateDraftPoint('point-1', { label: '尚未保存的名称' })
    })
    expect(result.current.hasUnsavedChanges).toBe(true)

    unmount()
  })

  it('clamps an enlarged log panel when the window becomes shorter', async () => {
    installMacroApi(createState())
    const originalInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 })

    const { result, unmount } = renderHook(() => useMacroController())
    await waitFor(() => expect(result.current.logPanelMaxHeight).toBe(588))

    act(() => {
      result.current.resizeLogPanelBy(1000)
    })
    expect(result.current.logPanelHeight).toBe(588)

    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    await waitFor(() => {
      expect(result.current.logPanelMaxHeight).toBe(388)
      expect(result.current.logPanelHeight).toBe(388)
    })

    unmount()
    Object.defineProperty(window, 'innerHeight', {
      configurable: true,
      value: originalInnerHeight
    })
  })
})
