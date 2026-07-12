import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  ThemeProvider,
  themeRegistry,
  useTheme,
  type AppearancePreferences,
  type ThemeId
} from '../../themes'
import { ThemeLogCharacter } from './ThemeLogCharacter'

const PROFESSION_THEME_IDS = [
  'longyin',
  'chaoguang',
  'xuehe',
  'jiuling',
  'suwen',
  'shenxiang'
] as const satisfies readonly ThemeId[]

type ThemeHarnessProps = {
  appearance: AppearancePreferences
  children?: ReactNode
}

function ThemeHarness({ appearance, children = <ThemeLogCharacter /> }: ThemeHarnessProps) {
  return <ThemeProvider appearance={appearance}>{children}</ThemeProvider>
}

function PreviewHarness() {
  const { resetPreviewAppearance, setPreviewAppearance } = useTheme()

  return (
    <>
      <button
        type="button"
        onClick={() => setPreviewAppearance({ themeId: 'suwen', cleanMode: false })}
      >
        预览素问
      </button>
      <button type="button" onClick={resetPreviewAppearance}>
        取消预览
      </button>
      <ThemeLogCharacter />
    </>
  )
}

function getCharacterImage(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector<HTMLImageElement>(
    '.theme-log-character img[data-asset="logCharacter"]'
  )
}

describe('ThemeLogCharacter', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each(PROFESSION_THEME_IDS)('renders the registered %s log character', (themeId) => {
    const { container } = render(<ThemeHarness appearance={{ themeId, cleanMode: false }} />)

    expect(getCharacterImage(container)).toHaveAttribute(
      'src',
      themeRegistry[themeId].assets.logCharacter
    )
  })

  it('omits the entire character rail for the default theme', () => {
    const { container } = render(
      <ThemeHarness appearance={{ themeId: 'default', cleanMode: false }} />
    )

    expect(container.querySelector('.theme-log-character')).not.toBeInTheDocument()
  })

  it('omits the entire character rail in clean mode', () => {
    const { container } = render(
      <ThemeHarness appearance={{ themeId: 'longyin', cleanMode: true }} />
    )

    expect(container.querySelector('.theme-log-character')).not.toBeInTheDocument()
  })

  it('follows a theme preview and restores the persisted character when cancelled', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <ThemeHarness appearance={{ themeId: 'longyin', cleanMode: false }}>
        <PreviewHarness />
      </ThemeHarness>
    )

    expect(getCharacterImage(container)).toHaveAttribute(
      'src',
      themeRegistry.longyin.assets.logCharacter
    )

    await user.click(screen.getByRole('button', { name: '预览素问' }))
    expect(getCharacterImage(container)).toHaveAttribute(
      'src',
      themeRegistry.suwen.assets.logCharacter
    )

    await user.click(screen.getByRole('button', { name: '取消预览' }))
    expect(getCharacterImage(container)).toHaveAttribute(
      'src',
      themeRegistry.longyin.assets.logCharacter
    )
  })

  it('removes the entire character rail after its image fails', async () => {
    const { container } = render(
      <ThemeHarness appearance={{ themeId: 'longyin', cleanMode: false }} />
    )

    fireEvent.error(getCharacterImage(container)!)

    await waitFor(() => {
      expect(container.querySelector('.theme-log-character')).not.toBeInTheDocument()
    })
  })

  it('recovers from an image failure after switching themes', async () => {
    const { container, rerender } = render(
      <ThemeHarness appearance={{ themeId: 'longyin', cleanMode: false }} />
    )

    fireEvent.error(getCharacterImage(container)!)
    await waitFor(() => expect(getCharacterImage(container)).not.toBeInTheDocument())

    rerender(<ThemeHarness appearance={{ themeId: 'chaoguang', cleanMode: false }} />)

    await waitFor(() => {
      expect(getCharacterImage(container)).toHaveAttribute(
        'src',
        themeRegistry.chaoguang.assets.logCharacter
      )
    })
  })

  it('collapses after a preload failure and recovers for the next theme', async () => {
    class PreloadImageMock {
      decoding = ''
      onerror: (() => void) | null = null
      onload: (() => void) | null = null

      set src(source: string) {
        queueMicrotask(() => {
          if (source.includes('/longyin/assets/log-character.webp')) this.onerror?.()
          else this.onload?.()
        })
      }
    }

    vi.stubGlobal('Image', PreloadImageMock)
    const { container, rerender } = render(
      <ThemeHarness appearance={{ themeId: 'longyin', cleanMode: false }} />
    )

    await waitFor(() => {
      expect(container.querySelector('.theme-log-character')).not.toBeInTheDocument()
    })

    rerender(<ThemeHarness appearance={{ themeId: 'chaoguang', cleanMode: false }} />)

    await waitFor(() => {
      expect(getCharacterImage(container)).toHaveAttribute(
        'src',
        themeRegistry.chaoguang.assets.logCharacter
      )
    })
  })

  it('exposes the character image as non-draggable decorative artwork', () => {
    const { container } = render(
      <ThemeHarness appearance={{ themeId: 'longyin', cleanMode: false }} />
    )
    const image = getCharacterImage(container)

    expect(image).toHaveAttribute('alt', '')
    expect(image).toHaveAttribute('aria-hidden', 'true')
    expect(image).toHaveAttribute('draggable', 'false')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
