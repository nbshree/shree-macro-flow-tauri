import { describe, expect, it } from 'vitest'

import {
  baseStatDefinitions,
  calculateInternalSkill,
  calculatorRuleMeta,
  defaultCalculatorInput,
  skillDefinitions,
  type BaseStatId,
  type CalculatorInput,
  type SkillId,
  type TierId
} from './index'

const cloneDefaultInput = (): CalculatorInput => structuredClone(defaultCalculatorInput)

const emptyInput = (): CalculatorInput => {
  const input = cloneDefaultInput()

  for (const statId of Object.keys(input.baseStats) as BaseStatId[]) {
    input.baseStats[statId] = 0
  }

  for (const skillId of Object.keys(input.skills) as SkillId[]) {
    input.skills[skillId] = { equipped: false, spirit: false }
  }

  return input
}

const getContribution = (
  result: ReturnType<typeof calculateInternalSkill>,
  contributionId: string
) => result.contributions.find((item) => item.id === contributionId)

const getContributionScore = (
  result: ReturnType<typeof calculateInternalSkill>,
  contributionId: string
) => getContribution(result, contributionId)?.score

const representativeBaseStats: CalculatorInput['baseStats'] = {
  season: 2.5,
  strengthOrQi: 50,
  attack: 120,
  armorPenetration: 80,
  factionRestraint: 3.2,
  criticalHit: 60,
  maxAttack: 40,
  minAttack: 20,
  agility: 10,
  endurance: 25,
  constitution: 30
}

const workbookBaseStats: CalculatorInput['baseStats'] = {
  season: 1,
  strengthOrQi: 100,
  attack: 100,
  armorPenetration: 100,
  factionRestraint: 1,
  criticalHit: 100,
  maxAttack: 100,
  minAttack: 100,
  agility: 100,
  endurance: 100,
  constitution: 100
}

const nearGrandmasterBaseStats: CalculatorInput['baseStats'] = {
  season: 2.5,
  strengthOrQi: 80,
  attack: 50,
  armorPenetration: 75,
  factionRestraint: 3,
  criticalHit: 120,
  maxAttack: 60,
  minAttack: 40,
  agility: 90,
  endurance: 70,
  constitution: 50
}

const representativeEquippedSkills: readonly SkillId[] = [
  'zhuoXingGuanRi',
  'chengYingFengShuo',
  'riYueLiangYi',
  'fenRen',
  'poFu',
  'wuYunYao'
]

const representativeSpiritSkills: readonly SkillId[] = [
  'chengYingFengShuo',
  'jueDianJingSha',
  'chuKuangGe',
  'zhongMiao',
  'caiFeng'
]

const setRepresentativeBaseStats = (input: CalculatorInput) => {
  Object.assign(input.baseStats, representativeBaseStats)
}

const setWorkbookBaseStats = (input: CalculatorInput) => {
  Object.assign(input.baseStats, workbookBaseStats)
}

const setEquippedSkills = (input: CalculatorInput, skillIds: readonly SkillId[]) => {
  for (const skillId of skillIds) {
    input.skills[skillId].equipped = true
  }
}

const setSpiritSkills = (input: CalculatorInput, skillIds: readonly SkillId[]) => {
  for (const skillId of skillIds) {
    input.skills[skillId].spirit = true
  }
}

interface CombinationScenario {
  name: string
  configure: (input: CalculatorInput) => void
  expected: {
    attributeScore: number
    traitScore: number
    totalScore: number
    tierId: TierId
    nextTierId: TierId | null
    scoreNeeded: number | null
    zhuoXingSpiritScore?: number
  }
}

const combinationScenarios: readonly CombinationScenario[] = [
  {
    name: '空输入保持零分并给出首档差值',
    configure: () => undefined,
    expected: {
      attributeScore: 0,
      traitScore: 0,
      totalScore: 0,
      tierId: 'rebirthRecommended',
      nextTierId: 'hero',
      scoreNeeded: 57
    }
  },
  {
    name: '工作簿默认基础属性不携带任何内功',
    configure: setWorkbookBaseStats,
    expected: {
      attributeScore: 46.98,
      traitScore: 0,
      totalScore: 46.98,
      tierId: 'rebirthRecommended',
      nextTierId: 'hero',
      scoreNeeded: 10.02
    }
  },
  {
    name: '仅录入一组混合基础属性',
    configure: setRepresentativeBaseStats,
    expected: {
      attributeScore: 25.556,
      traitScore: 0,
      totalScore: 25.556,
      tierId: 'rebirthRecommended',
      nextTierId: 'hero',
      scoreNeeded: 31.444
    }
  },
  {
    name: '仅携带六个普通内功',
    configure: (input) => setEquippedSkills(input, representativeEquippedSkills),
    expected: {
      attributeScore: 0,
      traitScore: 31.35,
      totalScore: 31.35,
      tierId: 'rebirthRecommended',
      nextTierId: 'hero',
      scoreNeeded: 25.65
    }
  },
  {
    name: '属性、六个携带内功和承影锋烁灵达到豪杰',
    configure: (input) => {
      setRepresentativeBaseStats(input)
      setEquippedSkills(input, representativeEquippedSkills)
      setSpiritSkills(input, ['chengYingFengShuo'])
    },
    expected: {
      attributeScore: 28.556,
      traitScore: 31.35,
      totalScore: 59.906,
      tierId: 'hero',
      nextTierId: 'master',
      scoreNeeded: 3.094
    }
  },
  {
    name: '属性、六个携带内功和五个静态灵达到宗师',
    configure: (input) => {
      setRepresentativeBaseStats(input)
      setEquippedSkills(input, representativeEquippedSkills)
      setSpiritSkills(input, representativeSpiritSkills)
    },
    expected: {
      attributeScore: 36.116,
      traitScore: 31.35,
      totalScore: 67.466,
      tierId: 'master',
      nextTierId: 'grandmaster',
      scoreNeeded: 2.534
    }
  },
  {
    name: '两个联动灵叠加灼星贯日灵达到泰斗',
    configure: (input) => {
      setRepresentativeBaseStats(input)
      setEquippedSkills(input, representativeEquippedSkills)
      setSpiritSkills(input, [...representativeSpiritSkills, 'zhuoXingGuanRi'])
    },
    expected: {
      attributeScore: 40.041,
      traitScore: 31.35,
      totalScore: 71.391,
      tierId: 'grandmaster',
      nextTierId: null,
      scoreNeeded: null,
      zhuoXingSpiritScore: 3.925
    }
  },
  {
    name: '众妙走携带分支且绝电走灵优先分支',
    configure: (input) => {
      setEquippedSkills(input, ['zhongMiao', 'jueDianJingSha'])
      setSpiritSkills(input, ['zhuoXingGuanRi', 'jueDianJingSha'])
    },
    expected: {
      attributeScore: 6.21,
      traitScore: 10.75,
      totalScore: 16.96,
      tierId: 'rebirthRecommended',
      nextTierId: 'hero',
      scoreNeeded: 40.04,
      zhuoXingSpiritScore: 3.75
    }
  },
  {
    name: '混合属性与一灵一携带联动停在泰斗线前',
    configure: (input) => {
      Object.assign(input.baseStats, nearGrandmasterBaseStats)
      setEquippedSkills(input, [
        'zhuoXingGuanRi',
        'chengYingFengShuo',
        'jueDianJingSha',
        'zhongMiao'
      ])
      setSpiritSkills(input, ['zhuoXingGuanRi', 'chengYingFengShuo', 'zhongMiao'])
    },
    expected: {
      attributeScore: 46.559,
      traitScore: 23,
      totalScore: 69.559,
      tierId: 'master',
      nextTierId: 'grandmaster',
      scoreNeeded: 0.441,
      zhuoXingSpiritScore: 3.675
    }
  },
  {
    name: '不含灼星的高分属性与内功组合',
    configure: (input) => {
      setWorkbookBaseStats(input)
      const skillIds: readonly SkillId[] = [
        'riYueLiangYi',
        'chuKuangGe',
        'fenRen',
        'zhanJing',
        'duanHanMang',
        'caiFeng'
      ]
      setEquippedSkills(input, skillIds)
      setSpiritSkills(input, skillIds)
    },
    expected: {
      attributeScore: 57.23,
      traitScore: 29,
      totalScore: 86.23,
      tierId: 'grandmaster',
      nextTierId: null,
      scoreNeeded: null
    }
  }
]

describe('7.20 rules', () => {
  it('publishes the workbook version and keeps the compatible display names', () => {
    expect(calculatorRuleMeta).toMatchObject({
      id: 'new-world-defense-7.20',
      version: '7.20',
      sourceRange: 'B2:I31'
    })
    expect(skillDefinitions.find((skill) => skill.id === 'chengYingFengShuo')?.label).toBe(
      '承影锋烁'
    )
    expect(skillDefinitions.find((skill) => skill.id === 'guanShanYue')?.label).toBe(
      '贯山月（卡轴）'
    )
  })

  it.each([
    ['season', 0.86],
    ['strengthOrQi', 0.1415],
    ['attack', 0.043],
    ['armorPenetration', 0.034],
    ['factionRestraint', 0.94],
    ['criticalHit', 0.0149],
    ['maxAttack', 0.0215],
    ['minAttack', 0.0215],
    ['agility', 0.0894],
    ['endurance', 0.043],
    ['constitution', 0.043]
  ] as const)('applies the %s base-stat multiplier', (statId, expectedScore) => {
    const input = emptyInput()
    input.baseStats[statId] = 1

    const result = calculateInternalSkill(input)

    expect(getContributionScore(result, `base-stat:${statId}`)).toBeCloseTo(expectedScore, 10)
    expect(result.attributeScore).toBeCloseTo(expectedScore, 10)
  })

  it.each([
    ['zhuoXingGuanRi', 6.25],
    ['chengYingFengShuo', 6],
    ['jueDianJingSha', 5.5],
    ['riYueLiangYi', 4.9],
    ['chuKuangGe', 5.1],
    ['zhongMiao', 5.25],
    ['fenRen', 4.7],
    ['zhanJing', 4.5],
    ['poFu', 5],
    ['guanShanYue', 3.9],
    ['duanHanMang', 4.8],
    ['jiShuai', 4.5],
    ['jingYu', 4.5],
    ['caiFeng', 5],
    ['wuYunYao', 4.5]
  ] as const)('applies the fixed %s equipped score', (skillId, expectedScore) => {
    const input = emptyInput()
    input.skills[skillId].equipped = true

    const result = calculateInternalSkill(input)

    expect(getContributionScore(result, `trait:${skillId}`)).toBeCloseTo(expectedScore, 10)
    expect(result.traitScore).toBeCloseTo(expectedScore, 10)
  })

  it.each([
    ['chengYingFengShuo', 3],
    ['jueDianJingSha', 2.46],
    ['riYueLiangYi', 2.2],
    ['chuKuangGe', 1.7],
    ['zhongMiao', 1.75],
    ['fenRen', 1.6],
    ['zhanJing', 1.5],
    ['poFu', 1.6],
    ['guanShanYue', 1.3],
    ['duanHanMang', 1.6],
    ['jiShuai', 1.5],
    ['jingYu', 1.5],
    ['caiFeng', 1.65],
    ['wuYunYao', 1.3]
  ] as const)('applies the fixed %s spirit score', (skillId, expectedScore) => {
    const input = emptyInput()
    input.skills[skillId].spirit = true

    const result = calculateInternalSkill(input)

    expect(getContributionScore(result, `spirit:${skillId}`)).toBeCloseTo(expectedScore, 10)
    expect(result.attributeScore).toBeCloseTo(expectedScore, 10)
  })

  it('defines exactly the 11 workbook fields and 15 internal skills', () => {
    expect(baseStatDefinitions).toHaveLength(11)
    expect(skillDefinitions).toHaveLength(15)
  })
})

describe('combined workbook scenarios', () => {
  for (const scenario of combinationScenarios) {
    it(scenario.name, () => {
      const input = emptyInput()
      scenario.configure(input)

      const result = calculateInternalSkill(input)

      expect(result.attributeScore).toBeCloseTo(scenario.expected.attributeScore, 10)
      expect(result.traitScore).toBeCloseTo(scenario.expected.traitScore, 10)
      expect(result.totalScore).toBeCloseTo(scenario.expected.totalScore, 10)
      expect(result.tier.id).toBe(scenario.expected.tierId)
      expect(result.nextTier?.id ?? null).toBe(scenario.expected.nextTierId)

      if (scenario.expected.scoreNeeded === null) {
        expect(result.nextTier).toBeNull()
      } else {
        expect(result.nextTier?.scoreNeeded).toBeCloseTo(scenario.expected.scoreNeeded, 10)
      }

      if (scenario.expected.zhuoXingSpiritScore !== undefined) {
        expect(getContributionScore(result, 'spirit:zhuoXingGuanRi')).toBeCloseTo(
          scenario.expected.zhuoXingSpiritScore,
          10
        )
      }
    })
  }
})

describe('calculateInternalSkill', () => {
  it('reproduces the 7.20 workbook golden sample', () => {
    const result = calculateInternalSkill(cloneDefaultInput())

    expect(result.attributeScore).toBeCloseTo(55.405, 10)
    expect(result.traitScore).toBeCloseTo(33.1, 10)
    expect(result.totalScore).toBeCloseTo(88.505, 10)
    expect(result.tier).toMatchObject({ id: 'grandmaster', label: '泰斗' })
    expect(result.nextTier).toBeNull()
    expect(result.contributions).toHaveLength(41)
    expect(result.contributions.some((item) => item.id.startsWith('cycle:'))).toBe(false)
  })

  it('keeps the equipped 灼星贯日 score fixed and only varies its spirit score', () => {
    const input = emptyInput()
    input.skills.zhuoXingGuanRi = { equipped: true, spirit: true }

    const withoutSynergy = calculateInternalSkill(input)
    expect(getContributionScore(withoutSynergy, 'spirit:zhuoXingGuanRi')).toBeCloseTo(2.425, 10)
    expect(getContributionScore(withoutSynergy, 'trait:zhuoXingGuanRi')).toBeCloseTo(6.25, 10)

    input.skills.zhongMiao.equipped = true
    input.skills.jueDianJingSha.equipped = true
    const equippedSynergy = calculateInternalSkill(input)
    expect(getContributionScore(equippedSynergy, 'spirit:zhuoXingGuanRi')).toBeCloseTo(3.5, 10)
    expect(getContributionScore(equippedSynergy, 'trait:zhuoXingGuanRi')).toBeCloseTo(6.25, 10)

    input.skills.zhongMiao.spirit = true
    input.skills.jueDianJingSha.spirit = true
    const spiritSynergy = calculateInternalSkill(input)
    expect(getContributionScore(spiritSynergy, 'spirit:zhuoXingGuanRi')).toBeCloseTo(3.925, 10)
    expect(getContributionScore(spiritSynergy, 'trait:zhuoXingGuanRi')).toBeCloseTo(6.25, 10)
    expect(spiritSynergy.synergyNotes.join(' ')).toContain('众妙-灵')
    expect(spiritSynergy.synergyNotes.join(' ')).toContain('绝电惊沙-灵')
  })

  it('仅在灼星贯日灵开启时激活联动贡献和当前联动池说明', () => {
    const input = emptyInput()
    setEquippedSkills(input, ['zhongMiao', 'jueDianJingSha'])

    const inactiveResult = calculateInternalSkill(input)
    expect(getContribution(inactiveResult, 'spirit:zhuoXingGuanRi')).toMatchObject({
      active: false,
      score: 0
    })
    expect(inactiveResult.synergyNotes.join(' ')).not.toContain('当前联动池共')

    input.skills.zhuoXingGuanRi.spirit = true
    const activeResult = calculateInternalSkill(input)
    expect(getContribution(activeResult, 'spirit:zhuoXingGuanRi')).toMatchObject({
      active: true,
      score: 3.5
    })
    expect(activeResult.synergyNotes.join(' ')).toContain('当前联动池共 16.25 分')
  })

  it.each([
    [false, false, 0, 0],
    [true, false, 0, 4.9],
    [false, true, 2.2, 0],
    [true, true, 2.2, 4.9]
  ] as const)(
    '保持日月两仪携带=%s与灵=%s两种状态独立',
    (equipped, spirit, expectedAttributeScore, expectedTraitScore) => {
      const input = emptyInput()
      input.skills.riYueLiangYi = { equipped, spirit }

      const result = calculateInternalSkill(input)

      expect(result.attributeScore).toBeCloseTo(expectedAttributeScore, 10)
      expect(result.traitScore).toBeCloseTo(expectedTraitScore, 10)
      expect(getContribution(result, 'spirit:riYueLiangYi')).toMatchObject({
        active: spirit,
        score: expectedAttributeScore
      })
      expect(getContribution(result, 'trait:riYueLiangYi')).toMatchObject({
        active: equipped,
        score: expectedTraitScore
      })
    }
  )

  it('返回完整的下一档名称、门槛和差值', () => {
    const result = calculateInternalSkill(emptyInput())

    expect(result.nextTier).toEqual({
      id: 'hero',
      label: '豪杰',
      minScore: 57,
      scoreNeeded: 57
    })
  })

  it.each([
    [56.9999, 'rebirthRecommended', 'hero', 0.0001],
    [57, 'hero', 'master', 6],
    [62.9999, 'hero', 'master', 0.0001],
    [63, 'master', 'grandmaster', 7],
    [69.9999, 'master', 'grandmaster', 0.0001],
    [70, 'grandmaster', null, null]
  ] as const)(
    'assigns unrounded score %s to %s',
    (score, expectedTier, expectedNextTier, expectedScoreNeeded) => {
      const input = emptyInput()
      input.baseStats.season = score / 0.86

      const result = calculateInternalSkill(input)

      expect(result.totalScore).toBeCloseTo(score, 10)
      expect(result.tier.id).toBe(expectedTier)
      expect(result.nextTier?.id ?? null).toBe(expectedNextTier)
      if (expectedScoreNeeded !== null) {
        expect(result.nextTier?.scoreNeeded).toBeCloseTo(expectedScoreNeeded, 10)
      }
    }
  )

  it('sanitizes negative and non-finite base stat values to zero', () => {
    const input = emptyInput()
    input.baseStats.attack = Number.POSITIVE_INFINITY
    input.baseStats.factionRestraint = -10
    input.baseStats.criticalHit = Number.NaN
    input.baseStats.endurance = Number.NEGATIVE_INFINITY

    const result = calculateInternalSkill(input)

    expect(result.attributeScore).toBe(0)
    expect(result.totalScore).toBe(0)
    for (const statId of ['attack', 'factionRestraint', 'criticalHit', 'endurance'] as const) {
      expect(getContribution(result, `base-stat:${statId}`)).toMatchObject({
        active: false,
        score: 0
      })
    }
  })
})
