import type { BaseStatDefinition, CalculatorInput, SkillDefinition, TierDefinition } from './types'

export const calculatorRuleMeta = {
  id: 'new-world-defense-7.20',
  title: '7.20日新世界防守团内功计算器',
  version: '7.20',
  author: '月望舒',
  contributors: ['杰少', '满天星河', '智齿'],
  formulaSource: '折字愿为安',
  spiritMode: 'boolean',
  sourceRange: 'B2:I31'
} as const

export const baseStatDefinitions: readonly BaseStatDefinition[] = [
  {
    id: 'season',
    label: '赛年',
    unit: 'percent',
    defaultValue: 1,
    scoreMultiplier: 0.86
  },
  {
    id: 'strengthOrQi',
    label: '力量/气海',
    unit: 'number',
    defaultValue: 100,
    scoreMultiplier: 0.1415
  },
  {
    id: 'attack',
    label: '攻击',
    unit: 'number',
    defaultValue: 100,
    scoreMultiplier: 0.043
  },
  {
    id: 'armorPenetration',
    label: '破防',
    unit: 'number',
    defaultValue: 100,
    scoreMultiplier: 0.034
  },
  {
    id: 'factionRestraint',
    label: '流派克制',
    unit: 'percent',
    defaultValue: 1,
    scoreMultiplier: 0.94
  },
  {
    id: 'criticalHit',
    label: '会心',
    unit: 'number',
    defaultValue: 100,
    scoreMultiplier: 0.0149
  },
  {
    id: 'maxAttack',
    label: '最大攻击',
    unit: 'number',
    defaultValue: 100,
    scoreMultiplier: 0.0215
  },
  {
    id: 'minAttack',
    label: '最小攻击',
    unit: 'number',
    defaultValue: 100,
    scoreMultiplier: 0.0215
  },
  {
    id: 'agility',
    label: '身法',
    unit: 'number',
    defaultValue: 100,
    scoreMultiplier: 0.0894
  },
  {
    id: 'endurance',
    label: '耐力',
    unit: 'number',
    defaultValue: 100,
    scoreMultiplier: 0.043
  },
  {
    id: 'constitution',
    label: '根骨',
    unit: 'number',
    defaultValue: 100,
    scoreMultiplier: 0.043
  }
]

export const skillDefinitions: readonly SkillDefinition[] = [
  {
    id: 'zhuoXingGuanRi',
    label: '灼星贯日',
    traitBaseScore: 6.25,
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
    traitBaseScore: 5.1,
    spiritBaseScore: 1.7,
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
    traitBaseScore: 4.7,
    spiritBaseScore: 1.6,
    defaultEquipped: false,
    defaultSpirit: false
  },
  {
    id: 'zhanJing',
    label: '斩精',
    traitBaseScore: 4.5,
    spiritBaseScore: 1.5,
    defaultEquipped: false,
    defaultSpirit: false
  },
  {
    id: 'poFu',
    label: '破釜',
    traitBaseScore: 5,
    spiritBaseScore: 1.6,
    defaultEquipped: true,
    defaultSpirit: false
  },
  {
    id: 'guanShanYue',
    label: '贯山月（卡轴）',
    traitBaseScore: 3.9,
    spiritBaseScore: 1.3,
    defaultEquipped: false,
    defaultSpirit: false
  },
  {
    id: 'duanHanMang',
    label: '锻寒芒',
    traitBaseScore: 4.8,
    spiritBaseScore: 1.6,
    defaultEquipped: false,
    defaultSpirit: false
  },
  {
    id: 'jiShuai',
    label: '击衰',
    traitBaseScore: 4.5,
    spiritBaseScore: 1.5,
    defaultEquipped: false,
    defaultSpirit: false
  },
  {
    id: 'jingYu',
    label: '惊羽',
    traitBaseScore: 4.5,
    spiritBaseScore: 1.5,
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
    traitBaseScore: 4.5,
    spiritBaseScore: 1.3,
    defaultEquipped: false,
    defaultSpirit: false
  }
]

export const tierDefinitions: readonly TierDefinition[] = [
  {
    id: 'rebirthRecommended',
    label: '建议转生',
    minScore: null,
    maxScore: 57
  },
  { id: 'hero', label: '豪杰', minScore: 57, maxScore: 63 },
  { id: 'master', label: '宗师', minScore: 63, maxScore: 70 },
  { id: 'grandmaster', label: '泰斗', minScore: 70, maxScore: null }
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
  ) as CalculatorInput['skills']
}
