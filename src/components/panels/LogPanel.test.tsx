import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ThemeProvider, type AppearancePreferences } from '@/themes'
import {
  createMacroApi,
  createMacroController,
  createMacroState,
  installMacroApi,
  renderWithUiProviders
} from '@/test/test-utils'

import { LogPanel } from './LogPanel'

function renderLogPanel(
  controller = createMacroController(),
  appearance: AppearancePreferences = { themeId: 'default', cleanMode: false }
) {
  return renderWithUiProviders(
    <ThemeProvider appearance={appearance}>
      <LogPanel controller={controller} />
    </ThemeProvider>
  )
}

describe('LogPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the log feed polite, scrollable content separate from the fixed panel chrome', () => {
    const controller = createMacroController({
      state: createMacroState({ logs: ['第一条日志', '第二条日志'] })
    })
    const { container } = renderLogPanel(controller)
    const panel = screen.getByRole('region', { name: '执行日志' })
    const row = container.querySelector<HTMLElement>('.log-panel-row')
    const feed = within(panel).getByText('第一条日志').parentElement

    expect(row).toHaveStyle({ height: '140px' })
    expect(row).toContainElement(panel)
    expect(row?.children).toHaveLength(1)
    expect(panel).toContainElement(feed)
    expect(feed).toHaveClass('log-panel__body')
    expect(feed).toHaveAttribute('aria-live', 'polite')
    expect(within(feed!).getByText('第二条日志')).toBeInTheDocument()
  })

  it('shows the empty state and disables clearing when no logs exist', () => {
    renderLogPanel()

    expect(screen.getByText('暂无日志。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清空执行日志' })).toBeDisabled()
  })

  it('places the active profession character beside the fixed log content', () => {
    const { container } = renderLogPanel(createMacroController(), {
      themeId: 'longyin',
      cleanMode: false
    })
    const panel = screen.getByRole('region', { name: '执行日志' })
    const row = container.querySelector<HTMLElement>('.log-panel-row')
    const rail = container.querySelector<HTMLElement>('.theme-log-character')

    expect(row).toContainElement(rail)
    expect(row).toContainElement(panel)
    expect(rail?.parentElement).toBe(row)
    expect(panel.parentElement).toBe(row)
    expect(panel).not.toContainElement(rail)
    expect(rail?.querySelector('img[data-asset="logCharacter"]')).toBeInTheDocument()
  })

  it('clears logs through the API and routes the returned state through the controller', async () => {
    const user = userEvent.setup()
    const state = createMacroState({ logs: ['待清空日志'] })
    const controller = createMacroController({ state })
    const api = createMacroApi(createMacroState())
    installMacroApi(api)
    renderLogPanel(controller)

    await user.click(screen.getByRole('button', { name: '清空执行日志' }))

    expect(api.clearLogs).toHaveBeenCalledTimes(1)
    expect(controller.updateState).toHaveBeenCalledWith(expect.any(Promise))
  })

  it('adjusts panel height from the separator keyboard controls without regressing drag support', () => {
    const controller = createMacroController({ logPanelHeight: 176, logPanelMaxHeight: 460 })
    renderLogPanel(controller)
    const separator = screen.getByRole('separator', { name: '调整执行日志高度' })

    expect(separator).toHaveAttribute('aria-controls', 'execution-log-panel')
    expect(separator).toHaveAttribute('aria-valuemin', '96')
    expect(separator).toHaveAttribute('aria-valuemax', '460')
    expect(separator).toHaveAttribute('aria-valuenow', '176')
    expect(separator).toHaveAttribute('aria-valuetext', '176 像素')

    fireEvent.keyDown(separator, { key: 'ArrowUp' })
    fireEvent.keyDown(separator, { key: 'ArrowDown' })
    fireEvent.keyDown(separator, { key: 'ArrowUp', shiftKey: true })
    fireEvent.keyDown(separator, { key: 'ArrowDown', shiftKey: true })
    fireEvent.mouseDown(separator)

    expect(controller.resizeLogPanelBy).toHaveBeenNthCalledWith(1, 16)
    expect(controller.resizeLogPanelBy).toHaveBeenNthCalledWith(2, -16)
    expect(controller.resizeLogPanelBy).toHaveBeenNthCalledWith(3, 48)
    expect(controller.resizeLogPanelBy).toHaveBeenNthCalledWith(4, -48)
    expect(controller.startResizeLogPanel).toHaveBeenCalledTimes(1)
  })
})
