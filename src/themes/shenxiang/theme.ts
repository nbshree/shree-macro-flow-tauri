import type { ThemeDefinition } from '../types'

export const shenxiangThemeAssetPaths = {
  background: './assets/background.webp',
  character: './assets/character.webp',
  logCharacter: './assets/log-character.webp',
  preview: './assets/preview.webp',
  texture: './assets/paper-noise.webp',
  cornerTopRight: './assets/corner-top-right.svg',
  cornerBottomLeft: './assets/corner-bottom-left.svg'
} as const

export const shenxiangTheme: ThemeDefinition = {
  id: 'shenxiang',
  name: '神相',
  profession: '神相',
  description: '霁蓝、雪白与墨琴银纹交织的清越琴心主题。',
  preview: new URL('./assets/preview.webp', import.meta.url).href,
  assets: {
    background: new URL('./assets/background.webp', import.meta.url).href,
    character: new URL('./assets/character.webp', import.meta.url).href,
    logCharacter: new URL('./assets/log-character.webp', import.meta.url).href,
    texture: new URL('./assets/paper-noise.webp', import.meta.url).href,
    cornerTopRight: new URL('./assets/corner-top-right.svg', import.meta.url).href,
    cornerBottomLeft: new URL('./assets/corner-bottom-left.svg', import.meta.url).href
  }
}
