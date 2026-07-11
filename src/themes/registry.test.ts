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
import { xueheThemeAssetPaths } from './xuehe/theme'

describe('theme registry', () => {
  it('registers every supported theme once and in the declared order', () => {
    expect(THEME_IDS).toEqual(['default', 'longyin', 'chaoguang', 'xuehe'])
    expect(themes.map((theme) => theme.id)).toEqual(THEME_IDS)
    expect(Object.keys(themeRegistry)).toEqual(THEME_IDS)
    expect(themeRegistry.default.name).toBe('默认简洁')
    expect(themeRegistry.longyin.name).toBe('龙吟')
    expect(themeRegistry.longyin.profession).toBe('龙吟')
    expect(themeRegistry.chaoguang.name).toBe('潮光')
    expect(themeRegistry.chaoguang.profession).toBe('潮光')
    expect(themeRegistry.chaoguang.preview).toContain('preview.webp')
    expect(themeRegistry.xuehe).toMatchObject({
      id: 'xuehe',
      name: '血河',
      profession: '血河',
      description: '雾铁、绛红与暗金交织的冷峻枪阵主题。'
    })
    expect(themeRegistry.xuehe.preview).toContain('preview.webp')
    expect(themeRegistry.xuehe.assets.background).toContain('background.webp')
    expect(themeRegistry.xuehe.assets.character).toContain('character.webp')
    expect(themeRegistry.xuehe.assets.texture).toContain('paper-noise.webp')
    expect(xueheThemeAssetPaths).toEqual({
      background: './assets/background.webp',
      character: './assets/character.webp',
      preview: './assets/preview.webp',
      texture: './assets/paper-noise.webp',
      cornerTopRight: './assets/corner-top-right.svg',
      cornerBottomLeft: './assets/corner-bottom-left.svg'
    })
    expect(themeRegistry.xuehe.assets.cornerTopRight).toMatch(
      /^(?:data:image\/svg\+xml|.*corner-top-right\.svg)/
    )
    expect(themeRegistry.xuehe.assets.cornerBottomLeft).toMatch(
      /^(?:data:image\/svg\+xml|.*corner-bottom-left\.svg)/
    )
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
    expect(normalizeAppearance({ themeId: 'xuehe', cleanMode: true })).toEqual({
      themeId: 'xuehe',
      cleanMode: true
    })
  })
})
