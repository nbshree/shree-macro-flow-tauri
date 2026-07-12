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
import { chaoguangThemeAssetPaths } from './chaoguang/theme'
import { jiulingThemeAssetPaths } from './jiuling/theme'
import { longyinThemeAssetPaths } from './longyin/theme'
import { shenxiangThemeAssetPaths } from './shenxiang/theme'
import { suwenThemeAssetPaths } from './suwen/theme'
import { xueheThemeAssetPaths } from './xuehe/theme'

describe('theme registry', () => {
  it('registers every supported theme once and in the declared order', () => {
    expect(THEME_IDS).toEqual([
      'default',
      'longyin',
      'chaoguang',
      'xuehe',
      'jiuling',
      'suwen',
      'shenxiang'
    ])
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
      logCharacter: './assets/log-character.webp',
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
    expect(themeRegistry.jiuling).toMatchObject({
      id: 'jiuling',
      name: '九灵',
      profession: '九灵',
      description: '暮樱紫雾、幽蝶灵光与玄木灵杖交织的御灵主题。'
    })
    expect(themeRegistry.jiuling.preview).toContain('preview.webp')
    expect(themeRegistry.jiuling.assets.background).toContain('background.webp')
    expect(themeRegistry.jiuling.assets.character).toContain('character.webp')
    expect(themeRegistry.jiuling.assets.texture).toContain('paper-noise.webp')
    expect(jiulingThemeAssetPaths).toEqual({
      background: './assets/background.webp',
      character: './assets/character.webp',
      logCharacter: './assets/log-character.webp',
      preview: './assets/preview.webp',
      texture: './assets/paper-noise.webp',
      cornerTopRight: './assets/corner-top-right.svg',
      cornerBottomLeft: './assets/corner-bottom-left.svg'
    })
    expect(themeRegistry.jiuling.assets.cornerTopRight).toMatch(
      /^(?:data:image\/svg\+xml|.*corner-top-right\.svg)/
    )
    expect(themeRegistry.jiuling.assets.cornerBottomLeft).toMatch(
      /^(?:data:image\/svg\+xml|.*corner-bottom-left\.svg)/
    )
    expect(themeRegistry.suwen).toMatchObject({
      id: 'suwen',
      name: '素问',
      profession: '素问',
      description: '月白、青瓷绿与药玉金交织的柔和医者主题。'
    })
    expect(themeRegistry.suwen.preview).toContain('preview.webp')
    expect(themeRegistry.suwen.assets.background).toContain('background.webp')
    expect(themeRegistry.suwen.assets.character).toContain('character.webp')
    expect(themeRegistry.suwen.assets.texture).toContain('paper-noise.webp')
    expect(suwenThemeAssetPaths).toEqual({
      background: './assets/background.webp',
      character: './assets/character.webp',
      logCharacter: './assets/log-character.webp',
      preview: './assets/preview.webp',
      texture: './assets/paper-noise.webp',
      cornerTopRight: './assets/corner-top-right.svg',
      cornerBottomLeft: './assets/corner-bottom-left.svg'
    })
    expect(themeRegistry.suwen.assets.cornerTopRight).toMatch(
      /^(?:data:image\/svg\+xml|.*corner-top-right\.svg)/
    )
    expect(themeRegistry.suwen.assets.cornerBottomLeft).toMatch(
      /^(?:data:image\/svg\+xml|.*corner-bottom-left\.svg)/
    )
    expect(themeRegistry.shenxiang).toMatchObject({
      id: 'shenxiang',
      name: '神相',
      profession: '神相',
      description: '霁蓝、雪白与墨琴银纹交织的清越琴心主题。'
    })
    expect(themeRegistry.shenxiang.preview).toContain('preview.webp')
    expect(themeRegistry.shenxiang.assets.background).toContain('background.webp')
    expect(themeRegistry.shenxiang.assets.character).toContain('character.webp')
    expect(themeRegistry.shenxiang.assets.texture).toContain('paper-noise.webp')
    expect(shenxiangThemeAssetPaths).toEqual({
      background: './assets/background.webp',
      character: './assets/character.webp',
      logCharacter: './assets/log-character.webp',
      preview: './assets/preview.webp',
      texture: './assets/paper-noise.webp',
      cornerTopRight: './assets/corner-top-right.svg',
      cornerBottomLeft: './assets/corner-bottom-left.svg'
    })
    expect(themeRegistry.shenxiang.assets.cornerTopRight).toMatch(
      /^(?:data:image\/svg\+xml|.*corner-top-right\.svg)/
    )
    expect(themeRegistry.shenxiang.assets.cornerBottomLeft).toMatch(
      /^(?:data:image\/svg\+xml|.*corner-bottom-left\.svg)/
    )
  })

  it('registers a log character for every profession theme and omits it from default', () => {
    const professionThemes = THEME_IDS.filter((themeId) => themeId !== 'default')

    for (const themeId of professionThemes) {
      expect(themeRegistry[themeId].assets.logCharacter).toContain(
        `/themes/${themeId}/assets/log-character.webp`
      )
    }

    expect(themeRegistry.default.assets.logCharacter).toBeUndefined()
    expect(longyinThemeAssetPaths.logCharacter).toBe('./assets/log-character.webp')
    expect(chaoguangThemeAssetPaths.logCharacter).toBe('./assets/log-character.webp')
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
      expect(getThemeDefinition(themeId).assets.logCharacter).toBe(
        themeRegistry.longyin.assets.logCharacter
      )
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
    expect(normalizeAppearance({ themeId: 'jiuling', cleanMode: true })).toEqual({
      themeId: 'jiuling',
      cleanMode: true
    })
    expect(normalizeAppearance({ themeId: 'suwen', cleanMode: true })).toEqual({
      themeId: 'suwen',
      cleanMode: true
    })
    expect(normalizeAppearance({ themeId: 'shenxiang', cleanMode: true })).toEqual({
      themeId: 'shenxiang',
      cleanMode: true
    })
  })
})
