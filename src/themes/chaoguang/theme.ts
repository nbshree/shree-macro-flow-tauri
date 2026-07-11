import type { ThemeDefinition } from '../types'

export const chaoguangThemeAssetPaths = {
  background: './assets/background.webp',
  character: './assets/character.webp',
  preview: './assets/preview.webp',
  texture: './assets/paper-noise.webp',
  cornerTopRight: './assets/corner-top-right.svg',
  cornerBottomLeft: './assets/corner-bottom-left.svg'
} as const

export const chaoguangTheme: ThemeDefinition = {
  id: 'chaoguang',
  name: '潮光',
  profession: '潮光',
  description: '月白、雾霭蓝与鸢尾虹彩交织的轻盈海境主题。',
  preview: new URL('./assets/preview.webp', import.meta.url).href,
  assets: {
    background: new URL('./assets/background.webp', import.meta.url).href,
    character: new URL('./assets/character.webp', import.meta.url).href,
    texture: new URL('./assets/paper-noise.webp', import.meta.url).href,
    cornerTopRight: new URL('./assets/corner-top-right.svg', import.meta.url).href,
    cornerBottomLeft: new URL('./assets/corner-bottom-left.svg', import.meta.url).href
  }
}
