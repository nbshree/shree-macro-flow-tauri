import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { createMacroController, createMacroState, renderWithUiProviders } from '@/test/test-utils'
import type { ThemeId } from '@/themes'

import { WorkspaceHeader } from './WorkspaceHeader'

function renderHeader(themeId: ThemeId, onOpenTheme = vi.fn()) {
  const controller = createMacroController({
    state: createMacroState({ appearance: { themeId, cleanMode: false } })
  })
  const onWorkspaceChange = vi.fn()

  renderWithUiProviders(
    <WorkspaceHeader
      controller={controller}
      activeWorkspace="macro"
      themeTriggerRef={createRef<HTMLButtonElement>()}
      onWorkspaceChange={onWorkspaceChange}
      onOpenTheme={onOpenTheme}
    />
  )

  return { onOpenTheme, onWorkspaceChange }
}

describe('WorkspaceHeader', () => {
  it.each([
    ['longyin', '主题：龙吟'],
    ['chaoguang', '主题：潮光'],
    ['xuehe', '主题：血河'],
    ['jiuling', '主题：九灵'],
    ['suwen', '主题：素问'],
    ['shenxiang', '主题：神相']
  ] as const)('shows the registered theme name for %s', (themeId, label) => {
    renderHeader(themeId)

    expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    expect(screen.queryByText('龙吟·霜刃')).not.toBeInTheDocument()
  })

  it('opens the theme dialog from the theme button', async () => {
    const user = userEvent.setup()
    const onOpenTheme = vi.fn()
    renderHeader('longyin', onOpenTheme)

    await user.click(screen.getByRole('button', { name: '主题：龙吟' }))

    expect(onOpenTheme).toHaveBeenCalledTimes(1)
  })

  it('switches to the calculator workspace from the top-level tabs', async () => {
    const user = userEvent.setup()
    const { onWorkspaceChange } = renderHeader('longyin')

    await user.click(screen.getByRole('tab', { name: '内功评估' }))

    expect(onWorkspaceChange).toHaveBeenCalledWith('calculator')
  })

  it('supports arrow-key navigation between workspace tabs', async () => {
    const user = userEvent.setup()
    const { onWorkspaceChange } = renderHeader('longyin')

    const macroTab = screen.getByRole('tab', { name: '宏流程' })
    macroTab.focus()
    await user.keyboard('{ArrowRight}')

    expect(onWorkspaceChange).toHaveBeenCalledWith('calculator')
    expect(screen.getByRole('tab', { name: '内功评估' })).toHaveFocus()
  })
})
