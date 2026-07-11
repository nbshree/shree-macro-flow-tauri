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

  renderWithUiProviders(
    <WorkspaceHeader
      controller={controller}
      themeTriggerRef={createRef<HTMLButtonElement>()}
      onOpenTheme={onOpenTheme}
    />
  )

  return { onOpenTheme }
}

describe('WorkspaceHeader', () => {
  it.each([
    ['longyin', '主题：龙吟'],
    ['chaoguang', '主题：潮光'],
    ['xuehe', '主题：血河']
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
})
