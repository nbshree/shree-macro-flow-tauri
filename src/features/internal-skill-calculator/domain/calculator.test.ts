import { describe, expect, it } from 'vitest'

import {
  calculateInternalSkill,
  defaultCalculatorInput,
  type CalculatorInput,
  type SkillId
} from './index'

const cloneDefaultInput = (): CalculatorInput => structuredClone(defaultCalculatorInput)

const emptyInput = (): CalculatorInput => {
  const input = cloneDefaultInput()

  for (const statId of Object.keys(input.baseStats) as (keyof CalculatorInput['baseStats'])[]) {
    input.baseStats[statId] = 0
  }

  for (const skillId of Object.keys(input.skills) as SkillId[]) {
    input.skills[skillId] = { equipped: false, spirit: false }
  }

  return input
}

describe('calculateInternalSkill', () => {
  it('reproduces the cached Excel default sample', () => {
    const result = calculateInternalSkill(cloneDefaultInput())

    expect(result.attributeScore).toBeCloseTo(38.1479, 10)
    expect(result.traitScore).toBeCloseTo(33.55, 10)
    expect(result.totalScore).toBeCloseTo(71.6979, 10)
    expect(result.tier.id).toBe('goblinElite')
    expect(result.nextTier).toMatchObject({
      id: 'goblinGeneral',
      label: '哥布林将军',
      minScore: 72
    })
    expect(result.nextTier?.scoreNeeded).toBeCloseTo(0.3021, 10)
  })

  it.each([
    ['metalFire', 0],
    ['fireWood', 2.7],
    ['metalWood', 2.8]
  ] as const)('applies the %s cycle score', (cycleId, expectedScore) => {
    const input = emptyInput()
    input.cycleId = cycleId

    const result = calculateInternalSkill(input)

    expect(result.attributeScore).toBe(0)
    expect(result.traitScore).toBeCloseTo(expectedScore, 10)
    expect(result.totalScore).toBeCloseTo(expectedScore, 10)
  })

  it('reproduces the 众妙 and 绝电惊沙 precedence in 灼星贯日 formulas', () => {
    const input = emptyInput()
    input.skills.zhuoXingGuanRi = { equipped: true, spirit: true }

    const getZhuoXingScores = (result: ReturnType<typeof calculateInternalSkill>) => ({
      spirit: result.contributions.find((item) => item.id === 'spirit:zhuoXingGuanRi')?.score,
      trait: result.contributions.find((item) => item.id === 'trait:zhuoXingGuanRi')?.score
    })

    const withoutSynergy = calculateInternalSkill(input)
    expect(withoutSynergy.attributeScore).toBeCloseTo(2.425, 10)
    expect(withoutSynergy.traitScore).toBeCloseTo(4.1, 10)
    expect(getZhuoXingScores(withoutSynergy).spirit).toBeCloseTo(2.425, 10)
    expect(getZhuoXingScores(withoutSynergy).trait).toBeCloseTo(4.1, 10)

    input.skills.zhongMiao.equipped = true
    input.skills.jueDianJingSha.equipped = true
    const equippedSynergy = calculateInternalSkill(input)
    expect(equippedSynergy.attributeScore).toBeCloseTo(3.5, 10)
    expect(equippedSynergy.traitScore).toBeCloseTo(17, 10)
    expect(getZhuoXingScores(equippedSynergy).spirit).toBeCloseTo(3.5, 10)
    expect(getZhuoXingScores(equippedSynergy).trait).toBeCloseTo(6.25, 10)

    input.skills.zhongMiao.spirit = true
    input.skills.jueDianJingSha.spirit = true
    const spiritSynergy = calculateInternalSkill(input)
    expect(spiritSynergy.attributeScore).toBeCloseTo(8.135, 10)
    expect(spiritSynergy.traitScore).toBeCloseTo(17.85, 10)
    expect(getZhuoXingScores(spiritSynergy).spirit).toBeCloseTo(3.925, 10)
    expect(getZhuoXingScores(spiritSynergy).trait).toBeCloseTo(7.1, 10)
    expect(spiritSynergy.synergyNotes.join(' ')).toContain('众妙-灵')
    expect(spiritSynergy.synergyNotes.join(' ')).toContain('绝电惊沙-灵')
  })

  it.each([
    [62.9999, 'rebirthRecommended'],
    [63, 'smallGoblin'],
    [66, 'largeGoblin'],
    [69, 'goblinElite'],
    [72, 'goblinGeneral'],
    [75, 'goblinKing']
  ] as const)('assigns score %s to %s', (score, expectedTier) => {
    const input = emptyInput()
    input.baseStats.factionRestraint = score

    expect(calculateInternalSkill(input).tier.id).toBe(expectedTier)
  })

  it('sanitizes negative and non-finite base stat values to zero', () => {
    const input = emptyInput()
    input.baseStats.attack = Number.POSITIVE_INFINITY
    input.baseStats.factionRestraint = -10

    const result = calculateInternalSkill(input)

    expect(result.attributeScore).toBe(0)
    expect(result.totalScore).toBe(0)
  })
})
