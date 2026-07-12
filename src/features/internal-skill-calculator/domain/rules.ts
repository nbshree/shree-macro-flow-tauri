import type {
  BaseStatDefinition,
  CalculatorInput,
  CycleDefinition,
  SkillDefinition,
  TierDefinition
} from './types'

export const calculatorRuleMeta = {
  id: 'new-world-defense-7.8',
  title: '7.8 日新世界防守团内功计算器',
  version: '7.8',
  author: '月望舒',
  contributors: ['杰少', '满天星河', '智齿'],
  formulaSource: '折字愿为安',
  spiritMode: 'boolean',
  sourceRange: 'C3:C28、G3:G17、L2'
} as const

export const baseStatDefinitions: readonly BaseStatDefinition[] = [
  {
    id: 'season',
    label: '赛年',
    unit: 'percent',
    defaultValue: 0,
    scoreMultiplier: 0.88
  },
  {
    id: 'strengthOrQi',
    label: '力量/气海',
    unit: 'number',
    defaultValue: 36,
    scoreMultiplier: 2.5 * 0.0455 + 0.0425
  },
  {
    id: 'attack',
    label: '攻击',
    unit: 'number',
    defaultValue: 237,
    scoreMultiplier: 0.0455
  },
  {
    id: 'armorPenetration',
    label: '破防',
    unit: 'number',
    defaultValue: 83,
    scoreMultiplier: 0.0425
  },
  {
    id: 'factionRestraint',
    label: '流派克制',
    unit: 'percent',
    defaultValue: 4.7,
    scoreMultiplier: 1
  },
  {
    id: 'criticalHit',
    label: '会心',
    unit: 'number',
    defaultValue: 127,
    scoreMultiplier: 0.0182
  },
  {
    id: 'maxAttack',
    label: '最大攻击',
    unit: 'number',
    defaultValue: 86,
    scoreMultiplier: 0.0455 / 2
  },
  {
    id: 'minAttack',
    label: '最小攻击',
    unit: 'number',
    defaultValue: 36,
    scoreMultiplier: 0.0455 / 2
  },
  {
    id: 'agility',
    label: '身法',
    unit: 'number',
    defaultValue: 0,
    scoreMultiplier: 0.0182 * 6
  },
  {
    id: 'endurance',
    label: '耐力',
    unit: 'number',
    defaultValue: 0,
    scoreMultiplier: 0.0455
  },
  {
    id: 'constitution',
    label: '根骨',
    unit: 'number',
    defaultValue: 0,
    scoreMultiplier: 0.0455
  }
]

export const skillDefinitions: readonly SkillDefinition[] = [
  {
    id: 'zhuoXingGuanRi',
    label: '灼星贯日',
    traitBaseScore: 3,
    spiritBaseScore: 1.875,
    defaultEquipped: true,
    defaultSpirit: true
  },
  {
    id: 'chengYingFengShuo',
    label: '承影锋烁',
    traitBaseScore: 6,
    spiritBaseScore: 3,
    defaultEquipped: true,
    defaultSpirit: true
  },
  {
    id: 'jueDianJingSha',
    label: '绝电惊沙',
    traitBaseScore: 5.5,
    spiritBaseScore: 2.46,
    defaultEquipped: true,
    defaultSpirit: false
  },
  {
    id: 'riYueLiangYi',
    label: '日月两仪',
    traitBaseScore: 4.9,
    spiritBaseScore: 2.2,
    defaultEquipped: false,
    defaultSpirit: false
  },
  {
    id: 'chuKuangGe',
    label: '楚狂歌',
    traitBaseScore: 5.4,
    spiritBaseScore: 1.78,
    defaultEquipped: true,
    defaultSpirit: false
  },
  {
    id: 'zhongMiao',
    label: '众妙',
    traitBaseScore: 5.25,
    spiritBaseScore: 1.75,
    defaultEquipped: true,
    defaultSpirit: true
  },
  {
    id: 'fenRen',
    label: '焚刃',
    traitBaseScore: 5,
    spiritBaseScore: 1.65,
    defaultEquipped: false,
    defaultSpirit: false
  },
  {
    id: 'zhanJing',
    label: '斩精',
    traitBaseScore: 4.8,
    spiritBaseScore: 1.6,
    defaultEquipped: false,
    defaultSpirit: false
  },
  {
    id: 'poFu',
    label: '破釜',
    traitBaseScore: 4.8,
    spiritBaseScore: 1.6,
    defaultEquipped: true,
    defaultSpirit: false
  },
  {
    id: 'guanShanYue',
    label: '贯山月（卡轴）',
    traitBaseScore: 4.9,
    spiritBaseScore: 1.63,
    defaultEquipped: false,
    defaultSpirit: false
  },
  {
    id: 'duanHanMang',
    label: '锻寒芒',
    traitBaseScore: 4.8,
    spiritBaseScore: 1.65,
    defaultEquipped: false,
    defaultSpirit: false
  },
  {
    id: 'jiShuai',
    label: '击衰',
    traitBaseScore: 4.2,
    spiritBaseScore: 1.4,
    defaultEquipped: false,
    defaultSpirit: false
  },
  {
    id: 'jingYu',
    label: '惊羽',
    traitBaseScore: 4.8,
    spiritBaseScore: 1.6,
    defaultEquipped: false,
    defaultSpirit: false
  },
  {
    id: 'caiFeng',
    label: '裁锋',
    traitBaseScore: 5,
    spiritBaseScore: 1.65,
    defaultEquipped: false,
    defaultSpirit: false
  },
  {
    id: 'wuYunYao',
    label: '五韵谣',
    traitBaseScore: 1.75,
    spiritBaseScore: 1.3,
    defaultEquipped: false,
    defaultSpirit: false
  }
]

export const cycleDefinitions: readonly CycleDefinition[] = [
  { id: 'metalFire', label: '金火', score: 0 },
  { id: 'fireWood', label: '火木', score: 2.7 },
  { id: 'metalWood', label: '金木', score: 2.8 }
]

export const tierDefinitions: readonly TierDefinition[] = [
  {
    id: 'rebirthRecommended',
    label: '建议转生',
    minScore: null,
    maxScore: 63
  },
  { id: 'smallGoblin', label: '小哥布林', minScore: 63, maxScore: 66 },
  { id: 'largeGoblin', label: '大哥布林', minScore: 66, maxScore: 69 },
  { id: 'goblinElite', label: '哥布林精英', minScore: 69, maxScore: 72 },
  { id: 'goblinGeneral', label: '哥布林将军', minScore: 72, maxScore: 75 },
  { id: 'goblinKing', label: '哥布林国王', minScore: 75, maxScore: null }
]

export const defaultCalculatorInput: CalculatorInput = {
  baseStats: Object.fromEntries(
    baseStatDefinitions.map((definition) => [definition.id, definition.defaultValue])
  ) as Record<(typeof baseStatDefinitions)[number]['id'], number>,
  skills: Object.fromEntries(
    skillDefinitions.map((definition) => [
      definition.id,
      {
        equipped: definition.defaultEquipped,
        spirit: definition.defaultSpirit
      }
    ])
  ) as CalculatorInput['skills'],
  cycleId: 'metalFire'
}
