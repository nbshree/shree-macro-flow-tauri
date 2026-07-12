export type BaseStatId =
  | 'season'
  | 'strengthOrQi'
  | 'attack'
  | 'armorPenetration'
  | 'factionRestraint'
  | 'criticalHit'
  | 'maxAttack'
  | 'minAttack'
  | 'agility'
  | 'endurance'
  | 'constitution'

export type SkillId =
  | 'zhuoXingGuanRi'
  | 'chengYingFengDi'
  | 'jueDianJingSha'
  | 'riYueLiangYi'
  | 'chuKuangGe'
  | 'zhongMiao'
  | 'fenRen'
  | 'zhanJing'
  | 'poFu'
  | 'guanShanYue'
  | 'duanHanMang'
  | 'jiShuai'
  | 'jingYu'
  | 'caiFeng'
  | 'wuYunYao'

export type CycleId = 'metalFire' | 'fireWood' | 'metalWood'

export type TierId =
  | 'rebirthRecommended'
  | 'smallGoblin'
  | 'largeGoblin'
  | 'goblinElite'
  | 'goblinGeneral'
  | 'goblinKing'

export interface BaseStatDefinition {
  id: BaseStatId
  label: string
  unit: 'number' | 'percent'
  defaultValue: number
  scoreMultiplier: number
}

export interface SkillDefinition {
  id: SkillId
  label: string
  traitBaseScore: number
  spiritBaseScore: number
  defaultEquipped: boolean
  defaultSpirit: boolean
}

export interface CycleDefinition {
  id: CycleId
  label: string
  score: number
}

export interface SkillInput {
  equipped: boolean
  spirit: boolean
}

export interface CalculatorInput {
  baseStats: Record<BaseStatId, number>
  skills: Record<SkillId, SkillInput>
  cycleId: CycleId
}

export interface TierDefinition {
  id: TierId
  label: string
  minScore: number | null
  maxScore: number | null
}

export type ContributionCategory = 'base-stat' | 'spirit' | 'trait' | 'cycle'

export interface CalculatorContribution {
  id: string
  category: ContributionCategory
  sourceId: BaseStatId | SkillId | CycleId
  label: string
  score: number
  active: boolean
}

export interface NextTierResult {
  id: TierId
  label: string
  minScore: number
  scoreNeeded: number
}

export interface CalculatorResult {
  attributeScore: number
  traitScore: number
  totalScore: number
  tier: TierDefinition
  nextTier: NextTierResult | null
  contributions: CalculatorContribution[]
  synergyNotes: string[]
}
