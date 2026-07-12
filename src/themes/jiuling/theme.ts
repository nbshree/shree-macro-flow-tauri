import type { ThemeDefinition } from '../types'

export const jiulingThemeAssetPaths = {
  background: './assets/background.webp',
  character: './assets/character.webp',
  preview: './assets/preview.webp',
  texture: './assets/paper-noise.webp',
  cornerTopRight: './assets/corner-top-right.svg',
  cornerBottomLeft: './assets/corner-bottom-left.svg'
} as const

export const jiulingTheme: ThemeDefinition = {
  id: 'jiuling',
  name: '九灵',
  profession: '九灵',
  description: '暮樱紫雾、幽蝶灵光与玄木灵杖交织的御灵主题。',
  preview: new URL('./assets/preview.webp', import.meta.url).href,
  assets: {
    background: new URL('./assets/background.webp', import.meta.url).href,
    character: new URL('./assets/character.webp', import.meta.url).href,
    texture: new URL('./assets/paper-noise.webp', import.meta.url).href,
    cornerTopRight: new URL('./assets/corner-top-right.svg', import.meta.url).href,
    cornerBottomLeft: new URL('./assets/corner-bottom-left.svg', import.meta.url).href
  }
}
