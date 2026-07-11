import { describe, expect, it } from 'vitest'

import {
  DEFAULT_APPEARANCE,
  THEME_IDS,
  getThemeDefinition,
  isThemeId,
  normalizeAppearance,
  themeRegistry,
  themes
} from './index'

describe('theme registry', () => {
  it('registers every supported theme once and in the declared order', () => {
    expect(themes.map((theme) => theme.id)).toEqual(THEME_IDS)
    expect(Object.keys(themeRegistry)).toEqual(THEME_IDS)
    expect(themeRegistry.default.name).toBe('默认简洁')
    expect(themeRegistry.longyin.name).toBe('龙吟')
    expect(themeRegistry.longyin.profession).toBe('龙吟')
    expect(themeRegistry.chaoguang.name).toBe('潮光')
    expect(themeRegistry.chaoguang.profession).toBe('潮光')
    expect(themeRegistry.chaoguang.preview).toContain('preview.webp')
  })

  it.each(THEME_IDS)('recognizes the supported theme "%s"', (themeId) => {
    expect(isThemeId(themeId)).toBe(true)
    expect(getThemeDefinition(themeId)).toBe(themeRegistry[themeId])
  })

  it.each([undefined, null, '', 'unknown', 1, {}])(
    'falls back to longyin for an unknown theme id: %j',
    (themeId) => {
      expect(isThemeId(themeId)).toBe(false)
      expect(getThemeDefinition(themeId)).toBe(themeRegistry.longyin)
    }
  )

  it('normalizes missing and invalid appearance values without discarding a valid clean mode', () => {
    expect(normalizeAppearance()).toEqual(DEFAULT_APPEARANCE)
    expect(normalizeAppearance({ themeId: 'unknown', cleanMode: true })).toEqual({
      themeId: 'longyin',
      cleanMode: true
    })
    expect(normalizeAppearance({ themeId: 'default', cleanMode: null })).toEqual({
      themeId: 'default',
      cleanMode: false
    })
    expect(normalizeAppearance({ themeId: 'chaoguang', cleanMode: true })).toEqual({
      themeId: 'chaoguang',
      cleanMode: true
    })
  })
})
