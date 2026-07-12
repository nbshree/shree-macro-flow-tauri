export const THEME_IDS = ['default', 'longyin', 'chaoguang', 'xuehe', 'jiuling', 'suwen'] as const

export type ThemeId = (typeof THEME_IDS)[number]

export type ThemeAssets = {
  background?: string
  character?: string
  texture?: string
  cornerTopRight?: string
  cornerBottomLeft?: string
}

export type ThemeAssetKey = keyof ThemeAssets | 'preview'

export type ThemeDefinition = {
  id: ThemeId
  name: string
  profession?: string
  description: string
  preview: string
  assets: ThemeAssets
}

export type AppearancePreferences = {
  themeId: ThemeId
  cleanMode: boolean
}

export type AppearanceInput = {
  themeId?: string | null
  cleanMode?: boolean | null
}

export type ThemeAssetLoadState = 'idle' | 'loading' | 'loaded' | 'error'

export type ThemeAssetStatusMap = Partial<Record<ThemeAssetKey, ThemeAssetLoadState>>

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  themeId: 'longyin',
  cleanMode: false
}
