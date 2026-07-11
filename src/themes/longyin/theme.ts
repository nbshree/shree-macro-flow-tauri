import type { ThemeDefinition } from '../types'

export const longyinThemeAssetPaths = {
  background: './assets/background.webp',
  character: './assets/character.webp',
  preview: './assets/preview.webp',
  texture: './assets/paper-noise.webp',
  cornerTopRight: './assets/corner-top-right.svg',
  cornerBottomLeft: './assets/corner-bottom-left.svg'
} as const

export const longyinTheme: ThemeDefinition = {
  id: 'longyin',
  name: '龙吟·霜刃',
  profession: '龙吟',
  description: '宣纸灰蓝、墨色山水与冷峻霜刃构成的沉浸式武侠主题。',
  preview: new URL('./assets/preview.webp', import.meta.url).href,
  assets: {
    background: new URL('./assets/background.webp', import.meta.url).href,
    character: new URL('./assets/character.webp', import.meta.url).href,
    texture: new URL('./assets/paper-noise.webp', import.meta.url).href,
    cornerTopRight: new URL('./assets/corner-top-right.svg', import.meta.url).href,
    cornerBottomLeft: new URL('./assets/corner-bottom-left.svg', import.meta.url).href
  }
}
