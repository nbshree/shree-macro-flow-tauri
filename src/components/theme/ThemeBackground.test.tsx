import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ThemeProvider, type AppearancePreferences, type ThemeAssetKey } from '../../themes'
import { chaoguangTheme } from '../../themes/chaoguang/theme'
import { longyinTheme } from '../../themes/longyin/theme'
import { ThemeBackground } from './ThemeBackground'

const CHAOGUANG_APPEARANCE: AppearancePreferences = {
  themeId: 'chaoguang',
  cleanMode: false
}

type BackgroundAssetKey = Exclude<ThemeAssetKey, 'preview'>

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
  it('applies chaoguang appearance to the document and renders all five declared layers', () => {
    const { container } = render(<BackgroundHarness appearance={CHAOGUANG_APPEARANCE} />)
    const background = getBackgroundContainer(container)

    expect(document.documentElement).toHaveAttribute('data-theme', 'chaoguang')
    expect(document.documentElement).toHaveAttribute('data-clean-mode', 'false')
    expect(background).toHaveAttribute('data-theme-id', 'chaoguang')
    expect(background).toHaveAttribute('data-clean-mode', 'false')

    for (const asset of THEME_ASSET_KEYS) {
      expect(getAssetLayer(container, asset)).toHaveAttribute('src', chaoguangTheme.assets[asset]!)
    }
  })

  it('removes only the failed image layer and preserves every other layer', async () => {
    const onAssetError = vi.fn()
    const { container } = render(
      <BackgroundHarness appearance={CHAOGUANG_APPEARANCE} onAssetError={onAssetError} />
    )
    const failedSource = chaoguangTheme.assets.texture!
    const texture = getAssetLayer(container, 'texture')

    expect(texture).not.toBeNull()
    fireEvent.error(texture!)

    await waitFor(() => expect(getAssetLayer(container, 'texture')).toBeNull())
    expect(onAssetError).toHaveBeenCalledWith('texture', failedSource)
    for (const asset of THEME_ASSET_KEYS.filter((key) => key !== 'texture')) {
      expect(getAssetLayer(container, asset)).toBeInTheDocument()
    }
  })

  it('resets failed layer state after switching themes', async () => {
    const { container, rerender } = render(<BackgroundHarness appearance={CHAOGUANG_APPEARANCE} />)
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

    rerender(<BackgroundHarness appearance={CHAOGUANG_APPEARANCE} />)
    await waitFor(() => {
      expect(getBackgroundContainer(container)).toHaveAttribute('data-theme-id', 'chaoguang')
      expect(getAssetLayer(container, 'character')).toHaveAttribute(
        'src',
        chaoguangTheme.assets.character!
      )
    })
  })

  it('passes clean mode to both the document root and background container', () => {
    const { container } = render(
      <BackgroundHarness appearance={{ themeId: 'chaoguang', cleanMode: true }} />
    )

    expect(document.documentElement).toHaveAttribute('data-theme', 'chaoguang')
    expect(document.documentElement).toHaveAttribute('data-clean-mode', 'true')
    expect(getBackgroundContainer(container)).toHaveAttribute('data-clean-mode', 'true')
  })
})
