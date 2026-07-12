import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { MacroPoint } from '@/lib/macro-api'
import {
  createMacroApi,
  createMacroController,
  createMacroState,
  installMacroApi,
  renderWithUiProviders
} from '@/test/test-utils'

import { FlowPanel } from './FlowPanel'

const clickPoint: MacroPoint = {
  id: 'click-1',
  label: '单击步骤',
  action: 'click',
  enabled: true,
  x: 100,
  y: 200,
  key: '',
  modifiers: [],
  delaySeconds: 0.5,
  createdAt: 1
}

const doubleClickPoint: MacroPoint = {
  ...clickPoint,
  id: 'double-click-1',
  label: '双击步骤',
  action: 'doubleClick',
  enabled: false,
  x: -320,
  createdAt: 2
}

const keyPoint: MacroPoint = {
  ...clickPoint,
  id: 'key-1',
  label: '按键步骤',
  action: 'key',
  key: 'K',
  modifiers: ['Control'],
  createdAt: 3
}

function createFlowController() {
  const state = createMacroState({ points: [clickPoint, doubleClickPoint, keyPoint] })
  return createMacroController({ state })
}

describe('FlowPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders enabled state and lets mouse actions switch between single and double click', async () => {
    const user = userEvent.setup()
    const controller = createFlowController()
    installMacroApi(createMacroApi(controller.state))
    renderWithUiProviders(<FlowPanel controller={controller} />)

    expect(screen.getByText('总步骤 3 / 启用 2，拖拽手柄调整顺序')).toBeInTheDocument()

    const firstSwitch = screen.getByRole('switch', { name: '步骤 1 启用状态' })
    const secondSwitch = screen.getByRole('switch', { name: '步骤 2 启用状态' })
    expect(firstSwitch).toBeChecked()
    expect(secondSwitch).not.toBeChecked()
    expect(secondSwitch.closest('[role="row"]')).toHaveAttribute('data-enabled', 'false')
    expect(screen.getByRole('textbox', { name: '步骤 2 名称' })).toBeEnabled()

    const singleClickSelect = screen.getByRole('combobox', { name: '步骤 1 鼠标动作' })
    expect(singleClickSelect).toHaveTextContent('鼠标单击')
    expect(screen.getByRole('combobox', { name: '步骤 2 鼠标动作' })).toHaveTextContent('鼠标双击')
    expect(screen.queryByRole('combobox', { name: '步骤 3 鼠标动作' })).not.toBeInTheDocument()
    expect(screen.getByText('键盘按键')).toBeInTheDocument()

    await user.click(secondSwitch)
    expect(controller.updatePoint).toHaveBeenCalledWith('double-click-1', { enabled: true })

    await user.click(singleClickSelect)
    await user.click(await screen.findByRole('option', { name: '鼠标双击' }))
    expect(controller.updatePoint).toHaveBeenCalledWith('click-1', { action: 'doubleClick' })
  })

  it('keeps a disabled mouse step testable and labels its double-click test action', async () => {
    const user = userEvent.setup()
    const state = createMacroState({ points: [doubleClickPoint] })
    const controller = createMacroController({ state })
    const api = createMacroApi(state)
    installMacroApi(api)
    renderWithUiProviders(<FlowPanel controller={controller} />)

    const testButton = screen.getByRole('button', { name: '测试步骤 1 鼠标双击' })
    expect(testButton).toBeEnabled()

    await user.hover(testButton)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('测试鼠标双击')

    await user.click(testButton)
    expect(api.testPoint).toHaveBeenCalledWith('double-click-1')
    expect(controller.updateState).toHaveBeenCalledTimes(1)
  })

  it.each([
    { name: 'recording', state: { isRecording: true } },
    { name: 'running', state: { isRunning: true } }
  ])('locks enable and action controls while $name', ({ state: stateOverride }) => {
    const state = createMacroState({ points: [clickPoint], ...stateOverride })
    const controller = createMacroController({ state, isEditingLocked: true })
    installMacroApi(createMacroApi(state))
    renderWithUiProviders(<FlowPanel controller={controller} />)

    expect(screen.getByRole('switch', { name: '步骤 1 启用状态' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: '步骤 1 鼠标动作' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: '步骤 1 名称' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '测试步骤 1 鼠标单击' })).toBeDisabled()
  })
})
