import { baseStatDefinitions, cycleDefinitions, skillDefinitions, tierDefinitions } from './rules'
import type {
  CalculatorContribution,
  CalculatorInput,
  CalculatorResult,
  NextTierResult,
  SkillId,
  TierDefinition
} from './types'

const ZHUO_XING_BASE_POOL = 5.5

const roundForExplanation = (value: number) =>
  Math.round((value + Number.EPSILON) * 10_000) / 10_000

const sanitizeStatValue = (value: number) => (Number.isFinite(value) ? Math.max(0, value) : 0)

const getZhongMiaoSynergyScore = (input: CalculatorInput) => {
  if (input.skills.zhongMiao.spirit) {
    return 7
  }

  return input.skills.zhongMiao.equipped ? 5.25 : 0
}

const getJueDianSynergyScore = (input: CalculatorInput) => {
  if (input.skills.jueDianJingSha.spirit) {
    return 8
  }

  return input.skills.jueDianJingSha.equipped ? 5.5 : 0
}

const getZhuoXingPool = (input: CalculatorInput) =>
  ZHUO_XING_BASE_POOL + getZhongMiaoSynergyScore(input) + getJueDianSynergyScore(input)

const getTraitPotential = (skillId: SkillId, input: CalculatorInput) => {
  const definition = skillDefinitions.find((skill) => skill.id === skillId)

  if (!definition) {
    return 0
  }

  if (skillId === 'zhuoXingGuanRi') {
    return definition.traitBaseScore + 0.2 * getZhuoXingPool(input)
  }

  return definition.traitBaseScore
}

const getSpiritPotential = (skillId: SkillId, input: CalculatorInput) => {
  const definition = skillDefinitions.find((skill) => skill.id === skillId)

  if (!definition) {
    return 0
  }

  if (skillId === 'zhuoXingGuanRi') {
    return definition.spiritBaseScore + 0.1 * getZhuoXingPool(input)
  }

  return definition.spiritBaseScore
}

const getTier = (score: number): TierDefinition =>
  tierDefinitions.find((tier) => tier.maxScore === null || score < tier.maxScore) ??
  tierDefinitions[tierDefinitions.length - 1]

const getNextTier = (tier: TierDefinition, score: number): NextTierResult | null => {
  const currentIndex = tierDefinitions.findIndex((definition) => definition.id === tier.id)
  const nextTier = tierDefinitions[currentIndex + 1]

  if (!nextTier || nextTier.minScore === null) {
    return null
  }

  return {
    id: nextTier.id,
    label: nextTier.label,
    minScore: nextTier.minScore,
    scoreNeeded: Math.max(0, nextTier.minScore - score)
  }
}

const createSynergyNotes = (input: CalculatorInput) => {
  const zhongMiaoScore = getZhongMiaoSynergyScore(input)
  const jueDianScore = getJueDianSynergyScore(input)
  const notes = [
    `灼星贯日固定联动池为 ${ZHUO_XING_BASE_POOL} 分。`,
    input.skills.zhongMiao.spirit
      ? '众妙-灵生效，灼星贯日联动按 7 分计算。'
      : input.skills.zhongMiao.equipped
        ? '众妙已携带，灼星贯日联动按 5.25 分计算。'
        : '众妙未携带且无灵，未计入灼星贯日联动。',
    input.skills.jueDianJingSha.spirit
      ? '绝电惊沙-灵生效，灼星贯日联动按 8 分计算。'
      : input.skills.jueDianJingSha.equipped
        ? '绝电惊沙已携带，灼星贯日联动按 5.5 分计算。'
        : '绝电惊沙未携带且无灵，未计入灼星贯日联动。'
  ]

  if (input.skills.zhuoXingGuanRi.equipped || input.skills.zhuoXingGuanRi.spirit) {
    notes.push(
      `当前联动池共 ${roundForExplanation(
        ZHUO_XING_BASE_POOL + zhongMiaoScore + jueDianScore
      )} 分。`
    )
  }

  return notes
}

export const calculateInternalSkill = (input: CalculatorInput): CalculatorResult => {
  const baseStatContributions: CalculatorContribution[] = baseStatDefinitions.map((definition) => {
    const score = sanitizeStatValue(input.baseStats[definition.id]) * definition.scoreMultiplier

    return {
      id: `base-stat:${definition.id}`,
      category: 'base-stat',
      sourceId: definition.id,
      label: definition.label,
      score,
      active: score !== 0
    }
  })

  const spiritContributions: CalculatorContribution[] = skillDefinitions.map((definition) => {
    const active = input.skills[definition.id].spirit
    const score = active ? getSpiritPotential(definition.id, input) : 0

    return {
      id: `spirit:${definition.id}`,
      category: 'spirit',
      sourceId: definition.id,
      label: `${definition.label}-灵`,
      score,
      active
    }
  })

  const traitContributions: CalculatorContribution[] = skillDefinitions.map((definition) => {
    const active = input.skills[definition.id].equipped
    const score = active ? getTraitPotential(definition.id, input) : 0

    return {
      id: `trait:${definition.id}`,
      category: 'trait',
      sourceId: definition.id,
      label: definition.label,
      score,
      active
    }
  })

  const cycle =
    cycleDefinitions.find((definition) => definition.id === input.cycleId) ?? cycleDefinitions[0]
  const cycleContribution: CalculatorContribution = {
    id: `cycle:${cycle.id}`,
    category: 'cycle',
    sourceId: cycle.id,
    label: `${cycle.label}周天`,
    score: cycle.score,
    active: cycle.score !== 0
  }
  const attributeScore = [...baseStatContributions, ...spiritContributions].reduce(
    (total, contribution) => total + contribution.score,
    0
  )
  const traitScore = [...traitContributions, cycleContribution].reduce(
    (total, contribution) => total + contribution.score,
    0
  )
  const totalScore = attributeScore + traitScore
  const tier = getTier(totalScore)

  return {
    attributeScore,
    traitScore,
    totalScore,
    tier,
    nextTier: getNextTier(tier, totalScore),
    contributions: [
      ...baseStatContributions,
      ...spiritContributions,
      ...traitContributions,
      cycleContribution
    ],
    synergyNotes: createSynergyNotes(input)
  }
}
