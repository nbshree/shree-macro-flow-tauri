export type TowerProfessionId =
  | 'longyin'
  | 'kuanglan'
  | 'jinghong'
  | 'chaoguang'
  | 'jiuling'
  | 'xuehe'
  | 'xuanji'
  | 'shenxiang'
  | 'suimeng'
  | 'potie'
  | 'yutie'
  | 'zhenhai'
  | 'tianwen'

export type TowerCycleElement = 'metal' | 'fire' | 'wood' | 'earth'
export type TowerCycleLevel = 0 | 1 | 2 | 3

export type TowerSkillId =
  | 'zhuoXingGuanRi'
  | 'chengYingFengShuo'
  | 'riYueLiangYi'
  | 'jueDianJingSha'
  | 'poFu'
  | 'jiShuai'
  | 'guanShanYue'
  | 'jingYu'
  | 'duanHanMang'
  | 'poZhongYun'
  | 'lingQiong'
  | 'cangLangXing'
  | 'caiFeng'
  | 'zhongMiao'
  | 'zhanJing'
  | 'chuKuangGe'
  | 'fenRen'
  | 'wuYunYao'
  | 'naBaiGuan'
  | 'guLei'
  | 'yuQianZhang'
  | 'fuShaQue'
  | 'zhengPao'

export type TowerSelectableSkillId = Exclude<TowerSkillId, 'fuShaQue' | 'zhengPao'>

export type TowerOffenseStatId =
  | 'attack'
  | 'strengthOrQi'
  | 'maxMinAttack'
  | 'armorPenetration'
  | 'factionRestraint'
  | 'criticalHit'
  | 'agility'
  | 'constitutionAndEndurance'
  | 'seasonEnhancement'

export type TowerDefenseStatId =
  | 'constitution'
  | 'endurance'
  | 'innerOuterDefense'
  | 'defense'
  | 'factionResistance'
  | 'criticalResistance'
  | 'agility'
  | 'innerOuterCriticalResistance'
  | 'health'

export type TowerStatUnit = 'flat' | 'percent'

export interface TowerProfessionDefinition {
  id: TowerProfessionId
  label: string
}

export interface TowerCycleDefinition {
  id: TowerCycleElement
  label: string
  suffix: string
  allowedLevels: readonly TowerCycleLevel[]
}

export interface TowerSkillDefinition {
  id: TowerSkillId
  label: string
  rarity: 'rare' | 'normal'
  selectable: boolean
}

export interface TowerOffenseStatDefinition {
  id: TowerOffenseStatId
  label: string
  unit: TowerStatUnit
  description: string
  fullValue: number
  defaultValues: readonly [number, number]
}

export interface TowerDefenseStatDefinition {
  id: TowerDefenseStatId
  label: string
  unit: TowerStatUnit
  description: string
  fullValue: number
  defaultValues: readonly [number, number]
}

export interface TowerSkillSlotInput {
  skillId: TowerSelectableSkillId | null
  spirit: boolean
}

export interface TowerBuildInput {
  cycles: Record<TowerCycleElement, TowerCycleLevel>
  rareSkills: TowerSkillSlotInput[]
  normalSkills: TowerSkillSlotInput[]
  offenseStats: Record<TowerOffenseStatId, number>
  defenseStats: Record<TowerDefenseStatId, number>
}

export type WuyunSkillId =
  | 'nuLangJingTao'
  | 'baJianZhuMang'
  | 'yanGuangZhuoShi'
  | 'zhenLongYuan'
  | 'xunYingWuFeng'
  | 'suXueLingShuang'
  | 'baiZhanHun'
  | 'liuGuangRen'

export type WuyunValueId =
  | 'nuLangUnopposedShare'
  | 'nuLangContestedShare'
  | 'baJianUnopposedShare'
  | 'baJianContestedShare'
  | 'yanGuangShare'
  | 'zhenLongShare'
  | 'xunYingIncrease'
  | 'suXueBaseIncrease'
  | 'suXueStackIncrease'
  | 'baiZhanBaseIncrease'
  | 'baiZhanRageIncrease'
  | 'liuGuangIncrease'

export type WuyunScenarioId =
  | 'nuLangHighGround'
  | 'nuLangOuterTower'
  | 'nuLangBossOrThreeHigh'
  | 'baJianLowPressure'
  | 'baJianContested'
  | 'yanGuangUnopposed'
  | 'yanGuangContested'
  | 'zhenLongUnopposedRageArmor'
  | 'zhenLongUnopposedNoRageArmor'
  | 'zhenLongContestedRageArmor'
  | 'zhenLongContestedYueFeiRageArmor'
  | 'xunYingFirstTower'
  | 'xunYingAverageOrSecondTower'
  | 'xunYingHighGround'
  | 'suXueFullHealthTower'
  | 'suXueHalfHealthTower'
  | 'baiZhanWithRageArmor'
  | 'baiZhanWithoutRageArmor'
  | 'liuGuangExpected'
  | 'consumedPointsIncrease'

export interface WuyunValueDefinition {
  id: WuyunValueId
  label: string
  unit: 'percent'
  defaultValue: number
  minValue: number | null
  maxValue: number | null
}

export interface WuyunScenarioDefinition {
  id: WuyunScenarioId
  label: string
  note: string
}

export interface WuyunDefinition {
  id: WuyunSkillId
  label: string
  kind: 'damage-share' | 'damage-increase'
  defaultEnabled: boolean
  valueFields: readonly WuyunValueDefinition[]
  scenarios: readonly WuyunScenarioDefinition[]
}

export interface WuyunInput {
  enabled: Record<WuyunSkillId, boolean>
  values: Record<WuyunValueId, number>
  consumedPoints: number
}

export interface TowerCalculatorInput {
  professionId: TowerProfessionId
  battleDurationSeconds: number
  morale: number
  offenseWeight: number
  defenseWeight: number
  builds: [TowerBuildInput, TowerBuildInput]
  wuyun: WuyunInput
}

export interface TowerCycleScoreResult {
  id: TowerCycleElement
  label: string
  level: TowerCycleLevel
  score: number
}

export interface TowerStatScoreResult<Id extends string> {
  id: Id
  label: string
  inputValue: number
  fullValue: number
  marginalGain: number
  gain: number
  score: number
}

export interface TowerSkillScoreResult {
  id: TowerSkillId
  label: string
  score: number
  rarity: 'rare' | 'normal'
  selectable: boolean
  specialEffectContribution: number
  amplificationContribution: number
}

export interface TowerSkillSlotScoreResult extends TowerSkillSlotInput {
  slotIndex: number
  kind: 'rare' | 'normal'
  baseScore: number
  spiritScore: number
}

export type TowerRatingId =
  'joke' | 'bench' | 'qualified' | 'peak' | 'sunMoon' | 'peerless' | 'eternal'

export interface TowerRatingDefinition {
  id: TowerRatingId
  label: string
  visibleDescription: string
}

export interface TowerRatingResult extends TowerRatingDefinition {
  minScore: number
}

export interface TowerBuildResult {
  buildIndex: 0 | 1
  dynamicSkillScore: number
  cycleScore: number
  ownCycleScore: number
  reportedCycleScore: number
  offenseStatScore: number
  defenseStatScore: number
  ownDefenseStatScore: number
  reportedDefenseStatScore: number
  spiritScore: number
  antiDemolitionScore: number
  unopposedScore: number
  ownAntiDemolitionScore: number
  ownUnopposedScore: number
  antiDemolitionRating: string
  unopposedRating: string
  antiDemolitionRatingDetail: TowerRatingResult
  unopposedRatingDetail: TowerRatingResult
  totalSpecialEffect: number
  totalAmplification: number
  cycleScores: Record<TowerCycleElement, number>
  cycleResults: TowerCycleScoreResult[]
  offenseStatGain: number
  defenseStatGain: number
  offenseStatResults: TowerStatScoreResult<TowerOffenseStatId>[]
  defenseStatResults: TowerStatScoreResult<TowerDefenseStatId>[]
  dynamicSkillResults: TowerSkillScoreResult[]
  slotResults: TowerSkillSlotScoreResult[]
}

export interface WuyunScenarioResult extends WuyunScenarioDefinition {
  skillId: WuyunSkillId | null
  skillLabel: string
  expected: number
  score: number
}

export interface WuyunResult {
  scenarios: WuyunScenarioResult[]
  byId: Record<WuyunScenarioId, WuyunScenarioResult>
}

export interface TowerSharedResult {
  offenseMarginalGains: Record<TowerOffenseStatId, number>
  defenseMarginalGains: Record<TowerDefenseStatId, number>
  averageOffenseGain: number
  averageDefenseGain: number
  antiDemolitionThresholds: TowerRatingResult[]
  unopposedThresholds: TowerRatingResult[]
}

export interface TowerCalculatorResult {
  builds: [TowerBuildResult, TowerBuildResult]
  wuyun: WuyunResult
  shared: TowerSharedResult
}
