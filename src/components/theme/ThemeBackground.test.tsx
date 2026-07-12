import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ThemeProvider, type AppearancePreferences, type ThemeAssetKey } from '../../themes'
import { jiulingTheme } from '../../themes/jiuling/theme'
import { longyinTheme } from '../../themes/longyin/theme'
import { shenxiangTheme } from '../../themes/shenxiang/theme'
import { suwenTheme } from '../../themes/suwen/theme'
import { ThemeBackground } from './ThemeBackground'

const PROFESSION_THEME_CASES = [
  {
    id: 'jiuling',
    appearance: { themeId: 'jiuling', cleanMode: false } satisfies AppearancePreferences,
    theme: jiulingTheme
  },
  {
    id: 'suwen',
    appearance: { themeId: 'suwen', cleanMode: false } satisfies AppearancePreferences,
    theme: suwenTheme
  },
  {
    id: 'shenxiang',
    appearance: { themeId: 'shenxiang', cleanMode: false } satisfies AppearancePreferences,
    theme: shenxiangTheme
  }
] as const

type BackgroundAssetKey =
  'background' | 'texture' | 'character' | 'cornerTopRight' | 'cornerBottomLeft'

const THEME_ASSET_KEYS: BackgroundAssetKey[] = [
  'background',
  'texture',
  'character',
  'cornerTopRight',
  'cornerBottomLeft'
]

type BackgroundHarnessProps = {
  appearance: AppearancePreferences
  onAssetError?: (asset: ThemeAssetKey, source: string) => void
}

function BackgroundHarness({ appearance, onAssetError }: BackgroundHarnessProps) {
  return (
    <ThemeProvider appearance={appearance}>
      <ThemeBackground onAssetError={onAssetError} />
    </ThemeProvider>
  )
}

function getBackgroundContainer(container: HTMLElement): HTMLElement {
  const background = container.querySelector<HTMLElement>('.theme-background')
  if (!background) throw new Error('缺少主题背景容器')
  return background
}

function getAssetLayer(container: HTMLElement, asset: BackgroundAssetKey): HTMLImageElement | null {
  return container.querySelector<HTMLImageElement>(`img[data-asset='${asset}']`)
}

describe('ThemeBackground with ThemeProvider', () => {
  it.each(PROFESSION_THEME_CASES)(
    'applies $id appearance and renders all five declared layers',
    ({ id, appearance, theme }) => {
      const { container } = render(<BackgroundHarness appearance={appearance} />)
      const background = getBackgroundContainer(container)

      expect(document.documentElement).toHaveAttribute('data-theme', id)
      expect(document.documentElement).toHaveAttribute('data-clean-mode', 'false')
      expect(background).toHaveAttribute('data-theme-id', id)
      expect(background).toHaveAttribute('data-clean-mode', 'false')

      for (const asset of THEME_ASSET_KEYS) {
        expect(getAssetLayer(container, asset)).toHaveAttribute('src', theme.assets[asset]!)
      }
    }
  )

  it.each(PROFESSION_THEME_CASES)(
    'removes only a failed $id image layer and preserves every other layer',
    async ({ appearance, theme }) => {
      const onAssetError = vi.fn()
      const { container } = render(
        <BackgroundHarness appearance={appearance} onAssetError={onAssetError} />
      )
      const failedSource = theme.assets.texture!
      const texture = getAssetLayer(container, 'texture')

      expect(texture).not.toBeNull()
      fireEvent.error(texture!)

      await waitFor(() => expect(getAssetLayer(container, 'texture')).toBeNull())
      expect(onAssetError).toHaveBeenCalledWith('texture', failedSource)
      for (const asset of THEME_ASSET_KEYS.filter((key) => key !== 'texture')) {
        expect(getAssetLayer(container, asset)).toBeInTheDocument()
      }
    }
  )

  it.each(PROFESSION_THEME_CASES)(
    'resets failed $id layer state after switching themes',
    async ({ id, appearance, theme }) => {
      const { container, rerender } = render(<BackgroundHarness appearance={appearance} />)
      fireEvent.error(getAssetLayer(container, 'character')!)
      await waitFor(() => expect(getAssetLayer(container, 'character')).toBeNull())

      rerender(<BackgroundHarness appearance={{ themeId: 'longyin', cleanMode: false }} />)
      await waitFor(() => {
        expect(getBackgroundContainer(container)).toHaveAttribute('data-theme-id', 'longyin')
        expect(getAssetLayer(container, 'character')).toHaveAttribute(
          'src',
          longyinTheme.assets.character!
        )
      })

      rerender(<BackgroundHarness appearance={appearance} />)
      await waitFor(() => {
        expect(getBackgroundContainer(container)).toHaveAttribute('data-theme-id', id)
        expect(getAssetLayer(container, 'character')).toHaveAttribute(
          'src',
          theme.assets.character!
        )
      })
    }
  )

  it.each(PROFESSION_THEME_CASES)(
    'marks every $id artwork layer for hiding in clean mode',
    ({ id }) => {
      const { container } = render(
        <BackgroundHarness appearance={{ themeId: id, cleanMode: true }} />
      )
      const background = getBackgroundContainer(container)

      expect(document.documentElement).toHaveAttribute('data-theme', id)
      expect(document.documentElement).toHaveAttribute('data-clean-mode', 'true')
      expect(background).toHaveAttribute('data-theme-id', id)
      expect(background).toHaveAttribute('data-clean-mode', 'true')
      for (const asset of THEME_ASSET_KEYS) {
        expect(getAssetLayer(container, asset)).toBeInTheDocument()
      }
    }
  )
})
