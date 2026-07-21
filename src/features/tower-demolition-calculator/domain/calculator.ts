import {
  towerCycleDefinitions,
  towerDefenseStatDefinitions,
  towerExcelCompatibilityConstants,
  towerOffenseStatDefinitions,
  towerRatingDefinitions,
  towerSkillDefinitions,
  wuyunConsumedPointsScenarioDefinition,
  wuyunDefinitions
} from './rules'
import type {
  TowerBuildInput,
  TowerBuildResult,
  TowerCalculatorInput,
  TowerCalculatorResult,
  TowerCycleElement,
  TowerCycleLevel,
  TowerCycleScoreResult,
  TowerDefenseStatId,
  TowerOffenseStatId,
  TowerProfessionId,
  TowerRatingResult,
  TowerSharedResult,
  TowerSkillId,
  TowerSkillScoreResult,
  TowerSkillSlotInput,
  TowerSkillSlotScoreResult,
  TowerStatScoreResult,
  WuyunResult,
  WuyunScenarioId,
  WuyunScenarioResult
} from './types'

const SCORE_SCALE = 10_000
const SPECIAL_EFFECT_DILUTION_THRESHOLD = 0.2
const SPECIAL_EFFECT_DILUTION = 1.1
const BASE_CRITICAL_DAMAGE = 1.53
const CRITICAL_COEFFICIENT = 568
const CRITICAL_RESISTANCE_COEFFICIENT = 686

const finiteOrZero = (value: number) => (Number.isFinite(value) ? value : 0)

export const excelRound = (value: number, digits = 0) => {
  if (!Number.isFinite(value)) return 0

  const factor = 10 ** digits
  return (Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * factor)) / factor
}

const firstSlotMatch = (
  slots: readonly TowerSkillSlotInput[],
  skillId: TowerSkillId
): TowerSkillSlotInput | null => slots.find((slot) => slot.skillId === skillId) ?? null

const selectedContribution = (
  slots: readonly TowerSkillSlotInput[],
  skillId: TowerSkillId,
  normalValue: number,
  spiritValue: number
) => {
  const slot = firstSlotMatch(slots, skillId)
  if (!slot) return 0
  return slot.spirit ? spiritValue : normalValue
}

const fireAmplification = (level: TowerCycleLevel, duration: number) => {
  if (level === 0 || duration === 0) return 0

  const baseByLevel = [0, 0.012, 0.024, 0.04] as const
  const stackByLevel = [0, 0.004, 0.008, 0.016] as const
  const base = baseByLevel[level]
  const stack = stackByLevel[level]
  const stackedDuration =
    stack * 5 + stack * 2 * 5 + stack * 3 * 5 + stack * 4 * 5 + stack * 5 * (duration - 20)

  return base + stackedDuration / duration
}

interface BuildEffectContext {
  totalSpecialEffect: number
  totalAmplification: number
  specialEffectContributions: Partial<Record<TowerSkillId, number>>
  amplificationContributions: Partial<Record<TowerSkillId, number>>
  metalSpecialEffect: number
  fireAmplification: number
}

const calculateBuildEffects = (
  build: TowerBuildInput,
  battleDurationSeconds: number
): BuildEffectContext => {
  const rare = build.rareSkills
  const normal = build.normalSkills
  const metalSpecialEffect = [0, 0.014, 0.028, 0.05][build.cycles.metal]
  const currentFireAmplification = fireAmplification(
    build.cycles.fire,
    finiteOrZero(battleDurationSeconds)
  )
  const specialEffectContributions: Partial<Record<TowerSkillId, number>> = {
    zhuoXingGuanRi: selectedContribution(rare, 'zhuoXingGuanRi', 0.036, 0.054),
    jueDianJingSha: selectedContribution(rare, 'jueDianJingSha', 0.052, 0.073),
    zhongMiao: selectedContribution(normal, 'zhongMiao', 0.036, 0.036 * 1.3),
    poZhongYun: selectedContribution(normal, 'poZhongYun', 0.015, 0.018),
    caiFeng: selectedContribution(normal, 'caiFeng', 0.027, 0.035),
    lingQiong: selectedContribution(normal, 'lingQiong', 0.041, 0.052)
  }
  const amplificationContributions: Partial<Record<TowerSkillId, number>> = {
    chengYingFengShuo: selectedContribution(rare, 'chengYingFengShuo', 0.04, 0.06),
    riYueLiangYi: selectedContribution(rare, 'riYueLiangYi', 0.056, 0.081),
    wuYunYao: selectedContribution(normal, 'wuYunYao', 0.02, 0.035),
    naBaiGuan: selectedContribution(normal, 'naBaiGuan', 0.0225, 0.018),
    cangLangXing: selectedContribution(normal, 'cangLangXing', 0.027, 0.035),
    duanHanMang: selectedContribution(normal, 'duanHanMang', -0.025, -0.03),
    guLei: selectedContribution(normal, 'guLei', -0.025, -0.03)
  }
  const rawSpecialEffect =
    metalSpecialEffect +
    Object.values(specialEffectContributions).reduce((total, value) => total + value, 0)
  const totalSpecialEffect =
    rawSpecialEffect /
    (rawSpecialEffect > SPECIAL_EFFECT_DILUTION_THRESHOLD ? SPECIAL_EFFECT_DILUTION : 1)
  const totalAmplification =
    1 +
    towerExcelCompatibilityConstants.waterCycleAmplification +
    currentFireAmplification +
    Object.values(amplificationContributions).reduce((total, value) => total + value, 0)

  return {
    totalSpecialEffect,
    totalAmplification,
    specialEffectContributions,
    amplificationContributions,
    metalSpecialEffect,
    fireAmplification: currentFireAmplification
  }
}

const criticalProbability = (stat: number, coefficient: number) =>
  1 / (1 + Math.exp(1 - stat / coefficient))

const criticalExpectation = (stat: number, coefficient: number, criticalDamage: number) => {
  const probability = criticalProbability(stat, coefficient)
  return 1 - probability + probability * criticalDamage
}

const criticalDamageGain = (amount: number, criticalDamage: number) => {
  const original = criticalExpectation(452, CRITICAL_COEFFICIENT, criticalDamage)
  const changed = criticalExpectation(452, CRITICAL_COEFFICIENT, criticalDamage + amount)
  return changed / original - 1
}

const criticalHitGain = (amount: number, criticalDamage: number) => {
  const original = criticalExpectation(452, CRITICAL_COEFFICIENT, criticalDamage)
  const changed = criticalExpectation(452 + amount, CRITICAL_COEFFICIENT, criticalDamage)
  return changed / original - 1
}

const criticalResistanceGain = (amount: number) => {
  const original = criticalExpectation(565, CRITICAL_RESISTANCE_COEFFICIENT, 1.53)
  const changed = criticalExpectation(565 - amount, CRITICAL_RESISTANCE_COEFFICIENT, 1.53)
  return 1 - changed / original
}

const getProfessionAttackMultiplier = (professionId: TowerProfessionId) => {
  const coefficients: Partial<Record<TowerProfessionId, number>> = {
    xuehe: 0.06,
    shenxiang: 0.05,
    suimeng: 0.02
  }
  const coefficient = coefficients[professionId] ?? 0
  return 1 + coefficient / 1.1713
}

const calculateOffenseMarginalGains = (
  professionId: TowerProfessionId,
  firstBuild: TowerBuildInput,
  secondBuildEffects: BuildEffectContext
): Record<TowerOffenseStatId, number> => {
  const duanHanMang = firstSlotMatch(firstBuild.normalSkills, 'duanHanMang')
  const duanHanMangCriticalDamage = duanHanMang ? (duanHanMang.spirit ? 0.08 : 0.065) : 0
  const criticalDamage = BASE_CRITICAL_DAMAGE + duanHanMangCriticalDamage
  const attack = ((33 * 1.1713) / 2601) * 1.05 * getProfessionAttackMultiplier(professionId)
  const towerDefenseReduction = 0.05 + 0.024 + (professionId === 'longyin' ? 0.05 : 0)
  const fixedArmorPenetration =
    2150 + 93 + 27 + 100 + towerExcelCompatibilityConstants.externalArmorPenetrationCache
  const remainingTowerDefense = 3783 * (1 - towerDefenseReduction) - fixedArmorPenetration
  const armorPenetration =
    (1418 / (remainingTowerDefense - 33 + 1418) / (1418 / (remainingTowerDefense + 1418)) - 1) *
    0.95
  const criticalHit = criticalHitGain(66, criticalDamage) * 0.9

  return {
    attack,
    strengthOrQi: ((10 * 2.5) / 33) * attack + (10 / 33) * armorPenetration,
    maxMinAttack: (36 / 2 / 33) * attack,
    armorPenetration,
    factionRestraint: 0.011,
    criticalHit,
    agility: ((10 * 6) / 66) * criticalHit,
    constitutionAndEndurance: (10 / 33) * attack,
    seasonEnhancement: 0.017 / secondBuildEffects.totalAmplification
  }
}

const calculateDefenseMarginalGains = (): Record<TowerDefenseStatId, number> => {
  const health = 0.0137 * 0.9
  const defense = 0.0125
  const criticalResistance = criticalResistanceGain(66)

  return {
    constitution: ((10 * 74) / 991) * health,
    endurance: ((10 * 2.75) / 33) * defense,
    innerOuterDefense: (36 / 2 / 33) * defense,
    defense,
    factionResistance: 0.012 / 1.07,
    criticalResistance,
    agility: ((10 * 2) / 66) * criticalResistance,
    innerOuterCriticalResistance: (72 / 2 / 66) * criticalResistance,
    health
  }
}

const calculateCycleScores = (
  build: TowerBuildInput,
  effects: BuildEffectContext,
  firstBuild: TowerBuildInput,
  offenseWeight: number,
  defenseWeight: number
): TowerCycleScoreResult[] => {
  const duanHanMang = firstSlotMatch(firstBuild.normalSkills, 'duanHanMang')
  const criticalDamage =
    BASE_CRITICAL_DAMAGE + (duanHanMang ? (duanHanMang.spirit ? 0.08 : 0.065) : 0)
  const metalShare = [0, 0.014, 0.028, 0.05][build.cycles.metal]
  const metalCriticalDamage = [0, 0.024, 0.048, 0.08][build.cycles.metal]
  const metalScore = excelRound(
    (metalShare + criticalDamageGain(metalCriticalDamage, criticalDamage)) * SCORE_SCALE
  )
  const fireScore = excelRound(
    build.cycles.fire === 0
      ? 0
      : (effects.fireAmplification / (effects.totalAmplification - effects.fireAmplification)) *
          SCORE_SCALE
  )
  const woodGainByLevel: Record<TowerCycleLevel, number> = {
    0: 0,
    1: 1 / (1 - 0.07) - 1,
    2: (1 / (1 - 0.15)) * -1,
    3: 1 / (1 - 0.25) - 1
  }
  const woodScore = excelRound(woodGainByLevel[build.cycles.wood] * SCORE_SCALE * 0.4 * 0.5)
  const earthGainByLevel: Record<TowerCycleLevel, number> = {
    0: 0,
    1: 0.015 * 0.9 + (0.006 * 4) / (1 + 0.15),
    2: 0.03 * 0.9 + (0.012 * 4) / (1 + 0.15),
    3: 0.06 * 0.9 + (0.02 * 4) / (1 + 0.15)
  }
  const defenseRatio = offenseWeight === 0 ? 0 : defenseWeight / offenseWeight
  const earthScore = excelRound(earthGainByLevel[build.cycles.earth] * SCORE_SCALE * defenseRatio)
  const scores: Record<TowerCycleElement, number> = {
    metal: metalScore,
    fire: fireScore,
    wood: woodScore,
    earth: earthScore
  }

  return towerCycleDefinitions.map((definition) => ({
    id: definition.id,
    label: definition.label,
    level: build.cycles[definition.id],
    score: scores[definition.id]
  }))
}

const getFirstLevelCycleScore = (
  build: TowerBuildInput,
  cycleScores: Record<TowerCycleElement, number>
) => {
  const orderedElements: readonly TowerCycleElement[] = ['metal', 'fire', 'wood', 'earth']
  const element = orderedElements.find((candidate) => build.cycles[candidate] === 1)
  return element ? cycleScores[element] : 0
}

const calculateDynamicSkillResults = (
  input: TowerCalculatorInput,
  build: TowerBuildInput,
  effects: BuildEffectContext,
  cycleScores: Record<TowerCycleElement, number>
): TowerSkillScoreResult[] => {
  const special = effects.specialEffectContributions
  const amplification = effects.amplificationContributions
  const zhuoXingEffect = special.zhuoXingGuanRi ?? 0
  const zhongMiaoEffect = special.zhongMiao ?? 0
  const defenseRatio = input.offenseWeight === 0 ? 0 : input.defenseWeight / input.offenseWeight
  const xunYingValue = input.wuyun.enabled.xunYingWuFeng
    ? finiteOrZero(input.wuyun.values.xunYingIncrease)
    : 0
  const jiShuaiScore = excelRound(450 * (1 - zhuoXingEffect - zhongMiaoEffect))
  const scores: Record<TowerSkillId, number> = {
    zhuoXingGuanRi: excelRound(360 + effects.totalSpecialEffect * 2000),
    chengYingFengShuo: excelRound(
      (0.04 / (effects.totalAmplification - (amplification.chengYingFengShuo ?? 0)) +
        (0.1 + 0.02) * 0.3) *
        SCORE_SCALE
    ),
    riYueLiangYi: excelRound(
      (0.056 / (effects.totalAmplification - (amplification.riYueLiangYi ?? 0))) * SCORE_SCALE
    ),
    jueDianJingSha: 550,
    poFu: 510,
    jiShuai: jiShuaiScore,
    guanShanYue: 280,
    jingYu: 470,
    duanHanMang: 500,
    poZhongYun: excelRound(
      150 * 0.5 +
        280 * 0.5 +
        (0.04 / (1 + finiteOrZero(input.morale) * 0.05 + xunYingValue)) * SCORE_SCALE
    ),
    lingQiong: 450,
    cangLangXing: excelRound(
      (0.054 / (effects.totalAmplification - (amplification.cangLangXing ?? 0))) * SCORE_SCALE
    ),
    caiFeng: 480,
    zhongMiao: excelRound(360 + 150 * (1 - zhuoXingEffect - zhongMiaoEffect)),
    zhanJing: excelRound(jiShuaiScore * 1.05),
    chuKuangGe: 530,
    fenRen: 100,
    wuYunYao:
      excelRound(
        (0.02 / (effects.totalAmplification - (amplification.wuYunYao ?? 0))) * SCORE_SCALE
      ) + getFirstLevelCycleScore(build, cycleScores),
    naBaiGuan: excelRound(
      (0.0225 / (effects.totalAmplification - (amplification.naBaiGuan ?? 0)) +
        0.04 * defenseRatio) *
        SCORE_SCALE
    ),
    guLei: excelRound(
      (-0.025 / (effects.totalAmplification - (amplification.guLei ?? 0)) +
        (0.06 / (1 + 0.15)) * defenseRatio) *
        SCORE_SCALE
    ),
    yuQianZhang: excelRound(0.045 * defenseRatio * SCORE_SCALE),
    fuShaQue: excelRound((0.03 / (1 + 0.08)) * defenseRatio * SCORE_SCALE),
    zhengPao: excelRound(0.045 * defenseRatio * SCORE_SCALE)
  }

  return towerSkillDefinitions.map((definition) => ({
    ...definition,
    score: scores[definition.id],
    specialEffectContribution: special[definition.id] ?? 0,
    amplificationContribution: amplification[definition.id] ?? 0
  }))
}

const calculateSlotResults = (
  build: TowerBuildInput,
  dynamicSkillResults: readonly TowerSkillScoreResult[],
  firstBuildEffects: BuildEffectContext
) => {
  const dynamicScores = Object.fromEntries(
    dynamicSkillResults.map((result) => [result.id, result.score])
  ) as Record<TowerSkillId, number>
  const firstBuildWuyunAmplification = firstBuildEffects.amplificationContributions.wuYunYao ?? 0
  const scoreSlot = (
    slot: TowerSkillSlotInput,
    slotIndex: number,
    kind: 'rare' | 'normal'
  ): TowerSkillSlotScoreResult => {
    const baseScore = slot.skillId ? dynamicScores[slot.skillId] : 0
    let spiritScore = 0

    if (slot.skillId && slot.spirit) {
      if (kind === 'rare') {
        spiritScore = excelRound(baseScore * (slot.skillId === 'zhuoXingGuanRi' ? 0.5 : 0.45))
      } else if (slot.skillId === 'wuYunYao') {
        // 第二套 H34:H37 仍绝对引用第一套 L26/L21，这是原表兼容行为。
        spiritScore = excelRound(
          150 / (firstBuildEffects.totalAmplification - firstBuildWuyunAmplification)
        )
      } else {
        spiritScore = excelRound(baseScore * 0.3)
      }
    }

    return { ...slot, slotIndex, kind, baseScore, spiritScore }
  }

  return [
    ...build.rareSkills.map((slot, index) => scoreSlot(slot, index, 'rare')),
    ...build.normalSkills.map((slot, index) => scoreSlot(slot, index, 'normal'))
  ]
}

const calculateOffenseStats = (
  build: TowerBuildInput,
  marginalGains: Record<TowerOffenseStatId, number>
) =>
  towerOffenseStatDefinitions.map<TowerStatScoreResult<TowerOffenseStatId>>((definition) => {
    const inputValue = finiteOrZero(build.offenseStats[definition.id])
    const gain = (inputValue / definition.fullValue) * marginalGains[definition.id]
    return {
      id: definition.id,
      label: definition.label,
      inputValue,
      fullValue: definition.fullValue,
      marginalGain: marginalGains[definition.id],
      gain,
      score: gain * SCORE_SCALE
    }
  })

const calculateDefenseStats = (
  build: TowerBuildInput,
  marginalGains: Record<TowerDefenseStatId, number>,
  offenseWeight: number,
  defenseWeight: number
) => {
  const defenseRatio = offenseWeight === 0 ? 0 : defenseWeight / offenseWeight

  return towerDefenseStatDefinitions.map<TowerStatScoreResult<TowerDefenseStatId>>((definition) => {
    const inputValue = finiteOrZero(build.defenseStats[definition.id])
    const gain =
      definition.id === 'health'
        ? inputValue > 12505
          ? ((inputValue - 12504) / definition.fullValue) * marginalGains[definition.id]
          : 0
        : (inputValue / definition.fullValue) * marginalGains[definition.id]
    return {
      id: definition.id,
      label: definition.label,
      inputValue,
      fullValue: definition.fullValue,
      marginalGain: marginalGains[definition.id],
      gain,
      score: gain * defenseRatio * SCORE_SCALE
    }
  })
}

const createRatingThresholds = (
  averageOffenseGain: number,
  kind: 'anti-demolition' | 'unopposed'
): TowerRatingResult[] => {
  const thresholds = [0, kind === 'anti-demolition' ? 7400 : 6900]
  const firstIncrementMultiplier = kind === 'anti-demolition' ? 0.9 : 1.6
  thresholds.push(thresholds[1] + averageOffenseGain * 6 * SCORE_SCALE * firstIncrementMultiplier)
  thresholds.push(thresholds[2] + averageOffenseGain * 6 * SCORE_SCALE)
  thresholds.push(thresholds[3] + averageOffenseGain * 6 * SCORE_SCALE * 0.5)
  thresholds.push(thresholds[4] + averageOffenseGain * 6 * SCORE_SCALE * 0.5)
  thresholds.push(thresholds[5] + averageOffenseGain * 6 * SCORE_SCALE * 0.5)

  return towerRatingDefinitions.map((definition, index) => ({
    ...definition,
    minScore: thresholds[index]
  }))
}

const getRating = (score: number, thresholds: readonly TowerRatingResult[]) =>
  [...thresholds].reverse().find((threshold) => score >= threshold.minScore) ?? thresholds[0]

const calculateWuyun = (input: TowerCalculatorInput): WuyunResult => {
  const values = input.wuyun.values
  const enabled = input.wuyun.enabled
  const pointIncrease = finiteOrZero(input.wuyun.consumedPoints) * 0.001
  const scenarioDefinitions = new Map(
    wuyunDefinitions.flatMap((definition) =>
      definition.scenarios.map((item) => [item.id, item] as const)
    )
  )
  const skillByScenario = new Map(
    wuyunDefinitions.flatMap((definition) =>
      definition.scenarios.map((item) => [item.id, definition] as const)
    )
  )
  const scenarios: WuyunScenarioResult[] = []
  const addScenario = (id: WuyunScenarioId, expected: number) => {
    const definition =
      id === 'consumedPointsIncrease'
        ? wuyunConsumedPointsScenarioDefinition
        : scenarioDefinitions.get(id)
    if (!definition) return
    const skill = skillByScenario.get(id)
    scenarios.push({
      ...definition,
      skillId: skill?.id ?? null,
      skillLabel: skill?.label ?? '消耗武蕴点',
      expected,
      score: excelRound(expected * SCORE_SCALE)
    })
  }

  addScenario('nuLangHighGround', values.nuLangUnopposedShare / (1.5 * 0.25))
  addScenario('nuLangOuterTower', values.nuLangContestedShare * 1.5)
  addScenario('nuLangBossOrThreeHigh', values.nuLangUnopposedShare / 1.5)
  addScenario('baJianLowPressure', values.baJianUnopposedShare * 0.98)
  addScenario('baJianContested', values.baJianContestedShare * 0.85)
  addScenario('yanGuangUnopposed', values.yanGuangShare)
  addScenario('yanGuangContested', values.yanGuangShare * 1.1 * 1.15)
  addScenario('zhenLongUnopposedRageArmor', values.zhenLongShare * 1.1)
  addScenario('zhenLongUnopposedNoRageArmor', values.zhenLongShare)
  addScenario('zhenLongContestedRageArmor', values.zhenLongShare * 1.1 * 1.1 * 1.1)
  addScenario(
    'zhenLongContestedYueFeiRageArmor',
    values.zhenLongShare * 1.1 * 1.1 * (1 + values.baiZhanRageIncrease)
  )
  addScenario('xunYingFirstTower', (values.xunYingIncrease / (1 + 0.15)) * 0.95)
  addScenario('xunYingAverageOrSecondTower', (values.xunYingIncrease / (1 + 0.35)) * 0.95)
  addScenario('xunYingHighGround', (values.xunYingIncrease / (1 + 0.5)) * 0.95)
  const baiZhanDenominatorIncrease = enabled.baiZhanHun ? values.baiZhanBaseIncrease : 0
  addScenario(
    'suXueFullHealthTower',
    (1 + values.suXueBaseIncrease / (1 + pointIncrease + baiZhanDenominatorIncrease)) *
      (1 + values.suXueStackIncrease * (0.1 + 0.2 + 0.3 + 0.4 + 2.5) * 0.8) -
      1
  )
  addScenario(
    'suXueHalfHealthTower',
    (1 + values.suXueBaseIncrease / (1 + pointIncrease + baiZhanDenominatorIncrease)) *
      (1 + values.suXueStackIncrease * 5 * 0.8) -
      1
  )
  addScenario(
    'baiZhanWithRageArmor',
    values.baiZhanBaseIncrease / (1 + pointIncrease) + 0.1 * 1.2 * 0.33
  )
  addScenario(
    'baiZhanWithoutRageArmor',
    values.baiZhanBaseIncrease / (1 + pointIncrease) + 0.1 * 0.33
  )
  addScenario('liuGuangExpected', 2 * values.liuGuangIncrease * 0.4)
  addScenario('consumedPointsIncrease', pointIncrease)

  return {
    scenarios,
    byId: Object.fromEntries(scenarios.map((item) => [item.id, item])) as Record<
      WuyunScenarioId,
      WuyunScenarioResult
    >
  }
}

export const calculateTowerDemolition = (input: TowerCalculatorInput): TowerCalculatorResult => {
  const effects: [BuildEffectContext, BuildEffectContext] = [
    calculateBuildEffects(input.builds[0], input.battleDurationSeconds),
    calculateBuildEffects(input.builds[1], input.battleDurationSeconds)
  ]
  const offenseMarginalGains = calculateOffenseMarginalGains(
    input.professionId,
    input.builds[0],
    effects[1]
  )
  const defenseMarginalGains = calculateDefenseMarginalGains()
  const averageOffenseGain =
    Object.values(offenseMarginalGains).reduce((total, value) => total + value, 0) /
    towerOffenseStatDefinitions.length
  const averageDefenseGain =
    towerDefenseStatDefinitions
      .filter((definition) => definition.id !== 'health')
      .reduce((total, definition) => total + defenseMarginalGains[definition.id], 0) /
    (towerDefenseStatDefinitions.length - 1)
  const antiDemolitionThresholds = createRatingThresholds(averageOffenseGain, 'anti-demolition')
  const unopposedThresholds = createRatingThresholds(averageOffenseGain, 'unopposed')

  const partialBuilds = input.builds.map((build, buildIndex) => {
    const cycleResults = calculateCycleScores(
      build,
      effects[buildIndex],
      input.builds[0],
      input.offenseWeight,
      input.defenseWeight
    )
    const cycleScores = Object.fromEntries(
      cycleResults.map((result) => [result.id, result.score])
    ) as Record<TowerCycleElement, number>
    const dynamicSkillResults = calculateDynamicSkillResults(
      input,
      build,
      effects[buildIndex],
      cycleScores
    )
    const slotResults = calculateSlotResults(build, dynamicSkillResults, effects[0])
    const offenseStatResults = calculateOffenseStats(build, offenseMarginalGains)
    const defenseStatResults = calculateDefenseStats(
      build,
      defenseMarginalGains,
      input.offenseWeight,
      input.defenseWeight
    )

    return {
      buildIndex: buildIndex as 0 | 1,
      effects: effects[buildIndex],
      cycleResults,
      cycleScores,
      ownCycleScore: cycleResults.reduce((total, result) => total + result.score, 0),
      dynamicSkillResults,
      slotResults,
      dynamicSkillScore: slotResults.reduce((total, result) => total + result.baseScore, 0),
      spiritScore: slotResults.reduce((total, result) => total + result.spiritScore, 0),
      offenseStatResults,
      offenseStatGain: offenseStatResults.reduce((total, result) => total + result.gain, 0),
      offenseStatScore: excelRound(
        offenseStatResults.reduce((total, result) => total + result.gain, 0) * SCORE_SCALE
      ),
      defenseStatResults,
      defenseStatGain: defenseStatResults.reduce((total, result) => total + result.gain, 0),
      ownDefenseStatScore: excelRound(
        defenseStatResults.reduce((total, result) => total + result.score, 0)
      )
    }
  })

  const builds = partialBuilds.map((partial, buildIndex): TowerBuildResult => {
    // 第二套顶部 Q8/S8 与 Q12 仍引用第一套 D16:D19、T17:T25。
    const reportedCycleScore =
      buildIndex === 1 ? partialBuilds[0].ownCycleScore : partial.ownCycleScore
    const reportedDefenseStatScore =
      buildIndex === 1 ? partialBuilds[0].ownDefenseStatScore : partial.ownDefenseStatScore
    const ownUnopposedScore =
      partial.dynamicSkillScore +
      partial.ownCycleScore +
      partial.offenseStatScore +
      partial.spiritScore
    const ownAntiDemolitionScore = ownUnopposedScore + partial.ownDefenseStatScore
    const unopposedScore =
      partial.dynamicSkillScore +
      reportedCycleScore +
      partial.offenseStatScore +
      partial.spiritScore
    const antiDemolitionScore = unopposedScore + reportedDefenseStatScore
    const antiDemolitionRatingDetail = getRating(antiDemolitionScore, antiDemolitionThresholds)
    const unopposedRatingDetail = getRating(unopposedScore, unopposedThresholds)

    return {
      buildIndex: partial.buildIndex,
      dynamicSkillScore: partial.dynamicSkillScore,
      cycleScore: reportedCycleScore,
      ownCycleScore: partial.ownCycleScore,
      reportedCycleScore,
      offenseStatScore: partial.offenseStatScore,
      defenseStatScore: reportedDefenseStatScore,
      ownDefenseStatScore: partial.ownDefenseStatScore,
      reportedDefenseStatScore,
      spiritScore: partial.spiritScore,
      antiDemolitionScore,
      unopposedScore,
      ownAntiDemolitionScore,
      ownUnopposedScore,
      antiDemolitionRating: antiDemolitionRatingDetail.label,
      unopposedRating: unopposedRatingDetail.label,
      antiDemolitionRatingDetail,
      unopposedRatingDetail,
      totalSpecialEffect: partial.effects.totalSpecialEffect,
      totalAmplification: partial.effects.totalAmplification,
      cycleScores: partial.cycleScores,
      cycleResults: partial.cycleResults,
      offenseStatGain: partial.offenseStatGain,
      defenseStatGain: partial.defenseStatGain,
      offenseStatResults: partial.offenseStatResults,
      defenseStatResults: partial.defenseStatResults,
      dynamicSkillResults: partial.dynamicSkillResults,
      slotResults: partial.slotResults
    }
  }) as [TowerBuildResult, TowerBuildResult]
  const shared: TowerSharedResult = {
    offenseMarginalGains,
    defenseMarginalGains,
    averageOffenseGain,
    averageDefenseGain,
    antiDemolitionThresholds,
    unopposedThresholds
  }

  return { builds, wuyun: calculateWuyun(input), shared }
}
