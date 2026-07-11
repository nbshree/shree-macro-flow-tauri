import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ThemeProvider, useTheme, type AppearancePreferences } from '../../themes'
import { ThemeDialog } from './ThemeDialog'

const LONGYIN_APPEARANCE: AppearancePreferences = {
  themeId: 'longyin',
  cleanMode: false
}

type DialogHarnessProps = {
  onApply?: (appearance: AppearancePreferences) => unknown | Promise<unknown>
}

function ThemeStateProbe() {
  const { activeAppearance, appearance, previewAppearance } = useTheme()

  return (
    <div>
      <output data-testid="persisted-theme">{appearance.themeId}</output>
      <output data-testid="active-theme">{activeAppearance.themeId}</output>
      <output data-testid="active-clean-mode">{String(activeAppearance.cleanMode)}</output>
      <output data-testid="preview-theme">{previewAppearance?.themeId ?? 'none'}</output>
    </div>
  )
}

function DialogHarness({ onApply = () => undefined }: DialogHarnessProps) {
  const [open, setOpen] = useState(true)
  const [appearance, setAppearance] = useState(LONGYIN_APPEARANCE)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const applyAppearance = async (nextAppearance: AppearancePreferences) => {
    await onApply(nextAppearance)
    setAppearance(nextAppearance)
  }

  return (
    <ThemeProvider appearance={appearance}>
      <ThemeStateProbe />
      <output data-testid="dialog-open">{String(open)}</output>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        打开主题设置
      </button>
      <ThemeDialog
        appearance={appearance}
        open={open}
        returnFocusRef={triggerRef}
        onApply={applyAppearance}
        onOpenChange={setOpen}
      />
    </ThemeProvider>
  )
}

function getThemeRadio(name: RegExp) {
  return screen.getByRole('radio', { name })
}

describe('ThemeDialog', () => {
  it('previews theme and clean mode changes immediately without persisting them', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)

    await user.click(getThemeRadio(/默认简洁/))
    await user.click(screen.getByRole('switch', { name: /纯净模式/ }))

    expect(screen.getByTestId('persisted-theme')).toHaveTextContent('longyin')
    expect(screen.getByTestId('active-theme')).toHaveTextContent('default')
    expect(screen.getByTestId('active-clean-mode')).toHaveTextContent('true')
    expect(screen.getByTestId('preview-theme')).toHaveTextContent('default')
    expect(document.documentElement).toHaveAttribute('data-theme', 'default')
    expect(document.documentElement).toHaveAttribute('data-clean-mode', 'true')
  })

  it('restores the original appearance when cancelled with the button', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)

    await user.click(getThemeRadio(/默认简洁/))
    await user.click(screen.getByRole('button', { name: '取消' }))

    expect(screen.getByTestId('dialog-open')).toHaveTextContent('false')
    expect(screen.getByTestId('active-theme')).toHaveTextContent('longyin')
    expect(screen.getByTestId('preview-theme')).toHaveTextContent('none')
    await waitFor(() => expect(screen.getByRole('button', { name: '打开主题设置' })).toHaveFocus())
  })

  it('restores the original appearance when dismissed with Escape', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)

    await user.click(getThemeRadio(/默认简洁/))
    await user.keyboard('{Escape}')

    expect(screen.getByTestId('dialog-open')).toHaveTextContent('false')
    expect(screen.getByTestId('active-theme')).toHaveTextContent('longyin')
    expect(screen.getByTestId('preview-theme')).toHaveTextContent('none')
    await waitFor(() => expect(screen.getByRole('button', { name: '打开主题设置' })).toHaveFocus())
  })

  it('applies the selected theme and clean mode, then closes the dialog', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn().mockResolvedValue(undefined)
    render(<DialogHarness onApply={onApply} />)

    await user.click(getThemeRadio(/默认简洁/))
    await user.click(screen.getByRole('switch', { name: /纯净模式/ }))
    await user.click(screen.getByRole('button', { name: /应用主题/ }))

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith({ themeId: 'default', cleanMode: true })
      expect(screen.getByTestId('dialog-open')).toHaveTextContent('false')
    })
    expect(screen.getByTestId('persisted-theme')).toHaveTextContent('default')
    expect(screen.getByTestId('active-theme')).toHaveTextContent('default')
    expect(screen.getByTestId('active-clean-mode')).toHaveTextContent('true')
    expect(screen.getByTestId('preview-theme')).toHaveTextContent('none')
  })

  it('rolls back the preview and shows a useful error when saving fails', async () => {
    const user = userEvent.setup()
    const onApply = vi.fn().mockRejectedValue(new Error('磁盘不可写'))
    render(<DialogHarness onApply={onApply} />)

    await user.click(getThemeRadio(/默认简洁/))
    await user.click(screen.getByRole('switch', { name: /纯净模式/ }))
    await user.click(screen.getByRole('button', { name: /应用主题/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('保存主题失败：磁盘不可写')
    expect(screen.getByTestId('dialog-open')).toHaveTextContent('true')
    expect(screen.getByTestId('active-theme')).toHaveTextContent('longyin')
    expect(screen.getByTestId('active-clean-mode')).toHaveTextContent('false')
    expect(screen.getByTestId('preview-theme')).toHaveTextContent('none')
    expect(getThemeRadio(/龙吟·霜刃/)).toBeChecked()
    expect(screen.getByRole('switch', { name: /纯净模式/ })).not.toBeChecked()
  })

  it('supports selecting native form controls from the keyboard', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)

    const defaultTheme = getThemeRadio(/默认简洁/)
    defaultTheme.focus()
    await user.keyboard(' ')

    const cleanMode = screen.getByRole('switch', { name: /纯净模式/ })
    cleanMode.focus()
    await user.keyboard(' ')

    expect(defaultTheme).toBeChecked()
    expect(cleanMode).toBeChecked()
    expect(screen.getByTestId('active-theme')).toHaveTextContent('default')
    expect(screen.getByTestId('active-clean-mode')).toHaveTextContent('true')
  })

  it('renders through a portal and focuses the selected theme when opened', async () => {
    const { container } = render(<DialogHarness />)

    expect(container.querySelector('[role="dialog"]')).toBeNull()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    await waitFor(() => expect(getThemeRadio(/龙吟·霜刃/)).toHaveFocus())
  })

  it('prevents duplicate submission and Escape dismissal while saving', async () => {
    const user = userEvent.setup()
    let finishSaving: (() => void) | undefined
    const onApply = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSaving = resolve
        })
    )
    render(<DialogHarness onApply={onApply} />)

    await user.click(screen.getByRole('button', { name: /应用主题/ }))

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('button', { name: /正在应用/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
    expect(screen.getByRole('button', { name: /正在应用/ })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.getByTestId('dialog-open')).toHaveTextContent('true')
    expect(onApply).toHaveBeenCalledTimes(1)

    finishSaving?.()
    await waitFor(() => expect(screen.getByTestId('dialog-open')).toHaveTextContent('false'))
  })

  it('keeps the dialog usable when a theme preview image fails', async () => {
    const user = userEvent.setup()
    render(<DialogHarness />)

    fireEvent.error(screen.getByAltText(/龙吟·霜刃主题预览/))
    await user.click(getThemeRadio(/默认简洁/))

    expect(getThemeRadio(/默认简洁/)).toBeChecked()
    expect(screen.getByTestId('active-theme')).toHaveTextContent('default')
  })
})
