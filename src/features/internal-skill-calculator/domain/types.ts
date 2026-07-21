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
  | 'chengYingFengShuo'
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

export type TierId = 'rebirthRecommended' | 'hero' | 'master' | 'grandmaster'

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

export interface SkillInput {
  equipped: boolean
  spirit: boolean
}

export interface CalculatorInput {
  baseStats: Record<BaseStatId, number>
  skills: Record<SkillId, SkillInput>
}

export interface TierDefinition {
  id: TierId
  label: string
  minScore: number | null
  maxScore: number | null
}

export type ContributionCategory = 'base-stat' | 'spirit' | 'trait'

export interface CalculatorContribution {
  id: string
  category: ContributionCategory
  sourceId: BaseStatId | SkillId
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
