import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createMacroApi,
  createMacroController,
  createMacroState,
  installMacroApi,
  renderWithUiProviders
} from '@/test/test-utils'

import { ProfilePanel } from './ProfilePanel'

function createProfileController() {
  const state = createMacroState({
    activeProfileId: 'profile-1',
    profiles: [
      { id: 'profile-1', name: '方案一', updatedAt: 1 },
      { id: 'profile-2', name: '方案二', updatedAt: 2 }
    ]
  })

  return createMacroController({ state, profileNameInput: '方案一' })
}

describe('ProfilePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders Select options in a portal and supports keyboard selection with focus restore', async () => {
    const user = userEvent.setup()
    const controller = createProfileController()
    const api = createMacroApi(controller.state)
    installMacroApi(api)
    const { container } = renderWithUiProviders(<ProfilePanel controller={controller} />)

    const trigger = screen.getByRole('combobox', { name: '当前方案' })
    trigger.focus()
    await user.keyboard('{Enter}')

    const secondProfile = await screen.findByRole('option', { name: '方案二' })
    expect(container.querySelector('[role="option"]')).toBeNull()

    await user.keyboard('{ArrowDown}{Enter}')

    expect(api.switchProfile).toHaveBeenCalledWith('profile-2')
    expect(controller.updateState).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(secondProfile).not.toBeInTheDocument()
  })

  it('dismisses Select with Escape and restores focus to its trigger', async () => {
    const user = userEvent.setup()
    const controller = createProfileController()
    installMacroApi(createMacroApi(controller.state))
    renderWithUiProviders(<ProfilePanel controller={controller} />)

    const trigger = screen.getByRole('combobox', { name: '当前方案' })
    await user.click(trigger)
    expect(await screen.findByRole('option', { name: '方案二' })).toBeInTheDocument()

    await user.keyboard('{Escape}')

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: '方案二' })).not.toBeInTheDocument()
      expect(trigger).toHaveFocus()
    })
  })

  it('disables profile selection while editing is locked', () => {
    const controller = createMacroController({
      ...createProfileController(),
      isEditingLocked: true
    })
    renderWithUiProviders(<ProfilePanel controller={controller} />)

    expect(screen.getByRole('combobox', { name: '当前方案' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重命名方案' })).toBeDisabled()
  })

  it('focuses cancel in the delete dialog and removes a profile only after confirmation', async () => {
    const user = userEvent.setup()
    const controller = createProfileController()
    renderWithUiProviders(<ProfilePanel controller={controller} />)

    const deleteTrigger = screen.getByRole('button', { name: '删除' })
    await user.click(deleteTrigger)

    let dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent('确定删除方案“方案一”吗？')
    const cancel = within(dialog).getByRole('button', { name: '取消' })
    await waitFor(() => expect(cancel).toHaveFocus())
    await user.click(cancel)

    expect(controller.removeActiveProfile).not.toHaveBeenCalled()
    await waitFor(() => expect(deleteTrigger).toHaveFocus())

    await user.click(deleteTrigger)
    dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: '删除' }))

    expect(controller.removeActiveProfile).toHaveBeenCalledTimes(1)
  })

  it('does not submit a profile rename when Enter belongs to an IME composition', () => {
    const controller = createMacroController({
      ...createProfileController(),
      isRenamingProfile: true,
      profileNameInput: '新方案'
    })
    renderWithUiProviders(<ProfilePanel controller={controller} />)

    const nameInput = screen.getByRole('textbox', { name: '方案名称' })
    nameInput.focus()
    fireEvent.compositionStart(nameInput)
    fireEvent.keyDown(nameInput, { key: 'Enter', keyCode: 13 })

    expect(controller.renameActiveProfile).not.toHaveBeenCalled()

    fireEvent.compositionEnd(nameInput)
    fireEvent.keyDown(nameInput, { key: 'Enter', keyCode: 13 })

    expect(controller.renameActiveProfile).toHaveBeenCalledTimes(1)
  })

  it('cancels an inline rename with Escape and restores focus to rename', async () => {
    const controller = createMacroController({
      ...createProfileController(),
      isRenamingProfile: true,
      profileNameInput: '新方案'
    })
    const { rerender } = renderWithUiProviders(<ProfilePanel controller={controller} />)

    fireEvent.keyDown(screen.getByRole('textbox', { name: '方案名称' }), { key: 'Escape' })

    expect(controller.cancelRenameProfile).toHaveBeenCalledTimes(1)
    expect(controller.renameActiveProfile).not.toHaveBeenCalled()

    rerender(<ProfilePanel controller={createProfileController()} />)
    await waitFor(() => expect(screen.getByRole('button', { name: '重命名方案' })).toHaveFocus())
  })
})
