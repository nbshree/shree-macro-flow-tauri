import { chaoguangTheme } from './chaoguang/theme'
import { defaultTheme } from './default/theme'
import { longyinTheme } from './longyin/theme'
import { xueheTheme } from './xuehe/theme'
import {
  DEFAULT_APPEARANCE,
  THEME_IDS,
  type AppearanceInput,
  type AppearancePreferences,
  type ThemeDefinition,
  type ThemeId
} from './types'

export const themeRegistry: Readonly<Record<ThemeId, ThemeDefinition>> = {
  default: defaultTheme,
  longyin: longyinTheme,
  chaoguang: chaoguangTheme,
  xuehe: xueheTheme
}

export const themes: readonly ThemeDefinition[] = THEME_IDS.map((id) => themeRegistry[id])

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEME_IDS.includes(value as ThemeId)
}

export function getThemeDefinition(themeId: unknown): ThemeDefinition {
  return themeRegistry[isThemeId(themeId) ? themeId : DEFAULT_APPEARANCE.themeId]
}

export function normalizeAppearance(appearance?: AppearanceInput | null): AppearancePreferences {
  return {
    themeId: isThemeId(appearance?.themeId) ? appearance.themeId : DEFAULT_APPEARANCE.themeId,
    cleanMode:
      typeof appearance?.cleanMode === 'boolean'
        ? appearance.cleanMode
        : DEFAULT_APPEARANCE.cleanMode
  }
}
