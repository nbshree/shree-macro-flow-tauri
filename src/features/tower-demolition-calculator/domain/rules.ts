import type {
  TowerBuildInput,
  TowerCalculatorInput,
  TowerCycleDefinition,
  TowerDefenseStatDefinition,
  TowerDefenseStatId,
  TowerOffenseStatDefinition,
  TowerOffenseStatId,
  TowerProfessionDefinition,
  TowerRatingDefinition,
  TowerSkillDefinition,
  TowerSkillSlotInput,
  WuyunDefinition,
  WuyunInput,
  WuyunScenarioDefinition,
  WuyunSkillId,
  WuyunValueDefinition,
  WuyunValueId
} from './types'

export const towerCalculatorRuleMeta = {
  id: 'tower-demolition-4.1.1.3-excel-compatible',
  title: '4.1.1.3 进攻团拆塔内功计算器',
  version: '4.1.1.3',
  author: '满天丶星河',
  formulaReference: '折字为安',
  optimizer: '休寒',
  formulaSource: '拆塔内功计算器4.1.1.3 （最终版）.xlsx',
  mode: 'excel-compatible'
} as const

export const towerExcelCompatibilityConstants = {
  brokenReferenceFallback: 0,
  externalArmorPenetrationCache: 10,
  externalNaBaiGuanAmplificationCache: 0,
  waterCycleAmplification: 0.025
} as const

export const towerProfessionDefinitions: readonly TowerProfessionDefinition[] = [
  { id: 'longyin', label: '龙吟' },
  { id: 'kuanglan', label: '狂澜' },
  { id: 'jinghong', label: '惊鸿' },
  { id: 'chaoguang', label: '潮光' },
  { id: 'jiuling', label: '九灵' },
  { id: 'xuehe', label: '血河' },
  { id: 'xuanji', label: '玄机' },
  { id: 'shenxiang', label: '神相' },
  { id: 'suimeng', label: '碎梦' },
  { id: 'potie', label: '破铁' },
  { id: 'yutie', label: '御铁' },
  { id: 'zhenhai', label: '镇海' },
  { id: 'tianwen', label: '天问' }
]

export const towerCycleDefinitions: readonly TowerCycleDefinition[] = [
  { id: 'metal', label: '金周天', suffix: '金', allowedLevels: [0, 1, 2, 3] },
  { id: 'fire', label: '火周天', suffix: '火', allowedLevels: [0, 1, 2, 3] },
  { id: 'wood', label: '木周天', suffix: '木', allowedLevels: [0, 1, 2, 3] },
  { id: 'earth', label: '土周天', suffix: '土', allowedLevels: [0, 1, 2, 3] }
]

export const towerSkillDefinitions: readonly TowerSkillDefinition[] = [
  { id: 'zhuoXingGuanRi', label: '灼星贯日', rarity: 'rare', selectable: true },
  { id: 'chengYingFengShuo', label: '承影锋烁', rarity: 'rare', selectable: true },
  { id: 'riYueLiangYi', label: '日月两仪', rarity: 'rare', selectable: true },
  { id: 'jueDianJingSha', label: '绝电惊沙', rarity: 'rare', selectable: true },
  { id: 'poFu', label: '破釜', rarity: 'normal', selectable: true },
  { id: 'jiShuai', label: '击衰', rarity: 'normal', selectable: true },
  { id: 'guanShanYue', label: '贯山月', rarity: 'normal', selectable: true },
  { id: 'jingYu', label: '惊羽', rarity: 'normal', selectable: true },
  { id: 'duanHanMang', label: '锻寒芒', rarity: 'normal', selectable: true },
  { id: 'poZhongYun', label: '破重云', rarity: 'normal', selectable: true },
  { id: 'lingQiong', label: '凌穹', rarity: 'normal', selectable: true },
  { id: 'cangLangXing', label: '沧浪行', rarity: 'normal', selectable: true },
  { id: 'caiFeng', label: '裁锋', rarity: 'normal', selectable: true },
  { id: 'zhongMiao', label: '众妙', rarity: 'normal', selectable: true },
  { id: 'zhanJing', label: '斩精', rarity: 'normal', selectable: true },
  { id: 'chuKuangGe', label: '楚狂歌', rarity: 'normal', selectable: true },
  { id: 'fenRen', label: '焚刃', rarity: 'normal', selectable: true },
  { id: 'wuYunYao', label: '五蕴谣', rarity: 'normal', selectable: true },
  { id: 'naBaiGuan', label: '纳百观', rarity: 'normal', selectable: true },
  { id: 'guLei', label: '固垒', rarity: 'normal', selectable: true },
  { id: 'yuQianZhang', label: '御千障', rarity: 'normal', selectable: true },
  { id: 'fuShaQue', label: '覆沙阙', rarity: 'normal', selectable: false },
  { id: 'zhengPao', label: '征袍', rarity: 'normal', selectable: false }
]

export const towerRareSkillDefinitions = towerSkillDefinitions.filter(
  (definition) => definition.rarity === 'rare' && definition.selectable
)

export const towerNormalSkillDefinitions = towerSkillDefinitions.filter(
  (definition) => definition.rarity === 'normal' && definition.selectable
)

export const towerOffenseStatDefinitions: readonly TowerOffenseStatDefinition[] = [
  {
    id: 'attack',
    label: '攻击',
    unit: 'flat',
    description: '满词条 33',
    fullValue: 33,
    defaultValues: [183, 0]
  },
  {
    id: 'strengthOrQi',
    label: '力量/气海',
    unit: 'flat',
    description: '满词条 10',
    fullValue: 10,
    defaultValues: [14, 0]
  },
  {
    id: 'maxMinAttack',
    label: '最大+最小攻',
    unit: 'flat',
    description: '满词条 36',
    fullValue: 36,
    defaultValues: [213, 186]
  },
  {
    id: 'armorPenetration',
    label: '破防',
    unit: 'flat',
    description: '满词条 33',
    fullValue: 33,
    defaultValues: [56, 168]
  },
  {
    id: 'factionRestraint',
    label: '流派克制',
    unit: 'percent',
    description: '满词条 1.2%',
    fullValue: 0.012,
    defaultValues: [0.012, 0]
  },
  {
    id: 'criticalHit',
    label: '会心',
    unit: 'flat',
    description: '满词条 66',
    fullValue: 66,
    defaultValues: [184, 342]
  },
  {
    id: 'agility',
    label: '身法',
    unit: 'flat',
    description: '满词条 10',
    fullValue: 10,
    defaultValues: [18, 0]
  },
  {
    id: 'constitutionAndEndurance',
    label: '根骨+耐力',
    unit: 'flat',
    description: '满词条 10',
    fullValue: 10,
    defaultValues: [39, 0]
  },
  {
    id: 'seasonEnhancement',
    label: '赛年强化',
    unit: 'percent',
    description: '满词条 1.7%',
    fullValue: 0.017,
    defaultValues: [0, 0]
  }
]

export const towerDefenseStatDefinitions: readonly TowerDefenseStatDefinition[] = [
  {
    id: 'constitution',
    label: '根骨',
    unit: 'flat',
    description: '满词条 10',
    fullValue: 10,
    defaultValues: [29, 0]
  },
  {
    id: 'endurance',
    label: '耐力',
    unit: 'flat',
    description: '满词条 10',
    fullValue: 10,
    defaultValues: [10, 0]
  },
  {
    id: 'innerOuterDefense',
    label: '内+外功防御',
    unit: 'flat',
    description: '满词条 36',
    fullValue: 36,
    defaultValues: [94, 372]
  },
  {
    id: 'defense',
    label: '防御',
    unit: 'flat',
    description: '满词条 33',
    fullValue: 33,
    defaultValues: [26, 0]
  },
  {
    id: 'factionResistance',
    label: '流派抵御',
    unit: 'percent',
    description: '满词条 1.2%',
    fullValue: 0.012,
    defaultValues: [0, 0]
  },
  {
    id: 'criticalResistance',
    label: '抗会心',
    unit: 'flat',
    description: '满词条 66',
    fullValue: 66,
    defaultValues: [66, 0]
  },
  {
    id: 'agility',
    label: '身法',
    unit: 'flat',
    description: '满词条 10',
    fullValue: 10,
    defaultValues: [18, 0]
  },
  {
    id: 'innerOuterCriticalResistance',
    label: '抗内+外功会心',
    unit: 'flat',
    description: '满词条 72',
    fullValue: 72,
    defaultValues: [345, 744]
  },
  {
    id: 'health',
    label: '气血',
    unit: 'flat',
    description: '超过 12505 后按满词条 991 计分',
    fullValue: 991,
    defaultValues: [12504, 0]
  }
]

export const towerRatingDefinitions: readonly TowerRatingDefinition[] = [
  { id: 'joke', label: '盼之吧没开玩笑', visibleDescription: '不如试用，疑似伪人' },
  { id: 'bench', label: '饮水机管理员', visibleDescription: '可担饮水机大任' },
  { id: 'qualified', label: '合格塔兵', visibleDescription: '塔已有取死之道' },
  { id: 'peak', label: '拆之巅、傲世间', visibleDescription: '拆之巅、傲世间' },
  { id: 'sunMoon', label: '手握日月拆星辰', visibleDescription: '手握日月拆星辰' },
  { id: 'peerless', label: '世间无我这般人', visibleDescription: '世间无我这般人' },
  { id: 'eternal', label: '拆道万古如长夜', visibleDescription: '拆道万古如长夜' }
]

const percentValue = (
  id: WuyunValueId,
  label: string,
  defaultValue: number,
  minValue: number | null = null,
  maxValue: number | null = null
): WuyunValueDefinition => ({
  id,
  label,
  unit: 'percent',
  defaultValue,
  minValue,
  maxValue
})

const scenario = (id: WuyunScenarioDefinition['id'], label: string, note: string) => ({
  id,
  label,
  note
})

export const wuyunDefinitions: readonly WuyunDefinition[] = [
  {
    id: 'nuLangJingTao',
    label: '怒浪惊涛（纯对单）',
    kind: 'damage-share',
    defaultEnabled: true,
    valueFields: [
      percentValue('nuLangUnopposedShare', '空拆占比', 0.05),
      percentValue('nuLangContestedShare', '抗拆占比', 0.056)
    ],
    scenarios: [
      scenario('nuLangHighGround', '1 高', '原表按空拆占比 ÷（1.5 × 0.25）'),
      scenario('nuLangOuterTower', '外塔', '原表按抗拆占比 × 1.5'),
      scenario('nuLangBossOrThreeHigh', '大龙/掉 3 高', '原表按空拆占比 ÷ 1.5')
    ]
  },
  {
    id: 'baJianZhuMang',
    label: '拔剑逐芒（纯对单）',
    kind: 'damage-share',
    defaultEnabled: true,
    valueFields: [
      percentValue('baJianUnopposedShare', '空拆占比', 0.06),
      percentValue('baJianContestedShare', '抗拆占比', 0.08)
    ],
    scenarios: [
      scenario('baJianLowPressure', '低压抗/空拆', '原表按空拆占比 × 0.98'),
      scenario('baJianContested', '抗拆', '原表按抗拆占比 × 0.85')
    ]
  },
  {
    id: 'yanGuangZhuoShi',
    label: '炎光灼世（对群）',
    kind: 'damage-share',
    defaultEnabled: false,
    valueFields: [percentValue('yanGuangShare', '空拆占比', 0.04)],
    scenarios: [
      scenario('yanGuangUnopposed', '空拆', '直接使用空拆占比'),
      scenario('yanGuangContested', '抗拆', '先乘 1.1，再乘 1.15')
    ]
  },
  {
    id: 'zhenLongYuan',
    label: '震龙渊（对群）',
    kind: 'damage-share',
    defaultEnabled: false,
    valueFields: [percentValue('zhenLongShare', '空拆占比', 0.04)],
    scenarios: [
      scenario('zhenLongUnopposedRageArmor', '空拆回怒衣', '空拆占比 × 1.1'),
      scenario('zhenLongUnopposedNoRageArmor', '空拆无回怒衣', '直接使用空拆占比'),
      scenario('zhenLongContestedRageArmor', '抗拆回怒衣', '抗拆占比 × 1.1 × 1.1'),
      scenario(
        'zhenLongContestedYueFeiRageArmor',
        '抗拆岳飞回怒衣',
        '抗拆占比 × 1.1 ×（1 + 百战魂增伤数值 2）'
      )
    ]
  },
  {
    id: 'xunYingWuFeng',
    label: '巡影无锋',
    kind: 'damage-increase',
    defaultEnabled: true,
    valueFields: [percentValue('xunYingIncrease', '增伤数值', 0.095, 0.075, 0.1)],
    scenarios: [
      scenario('xunYingFirstTower', '一塔期望', '增伤 ÷ 1.15 × 0.95'),
      scenario('xunYingAverageOrSecondTower', '均值/二塔', '增伤 ÷ 1.35 × 0.95'),
      scenario('xunYingHighGround', '高地期望', '增伤 ÷ 1.5 × 0.95')
    ]
  },
  {
    id: 'suXueLingShuang',
    label: '溯雪凌霜',
    kind: 'damage-increase',
    defaultEnabled: false,
    valueFields: [
      percentValue('suXueBaseIncrease', '增伤数值 1', 0.0344, 0.03, 0.04),
      percentValue('suXueStackIncrease', '增伤数值 2', 0.0086, 0.0075, 0.01)
    ],
    scenarios: [
      scenario('suXueFullHealthTower', '满血塔', '按原表 0.1/0.2/0.3/0.4/2.5 层模型'),
      scenario('suXueHalfHealthTower', '半血塔', '按原表 5 层模型')
    ]
  },
  {
    id: 'baiZhanHun',
    label: '百战魂',
    kind: 'damage-increase',
    defaultEnabled: false,
    valueFields: [
      percentValue('baiZhanBaseIncrease', '增伤数值 1', 0.0225, 0.0225, 0.03),
      percentValue('baiZhanRageIncrease', '增伤数值 2', 0.15, 0.15, 0.2)
    ],
    scenarios: [
      scenario('baiZhanWithRageArmor', '有回怒衣', '含 10% 绝技占比 × 1.2 × 0.33'),
      scenario('baiZhanWithoutRageArmor', '无回怒衣', '含 10% 绝技占比 × 0.33')
    ]
  },
  {
    id: 'liuGuangRen',
    label: '流光刃',
    kind: 'damage-increase',
    defaultEnabled: false,
    valueFields: [percentValue('liuGuangIncrease', '增伤数值', 0.045, 0.045, 0.06)],
    scenarios: [scenario('liuGuangExpected', '实际期望', '2 × 增伤 × 0.4')]
  }
]

export const wuyunConsumedPointsScenarioDefinition: WuyunScenarioDefinition = scenario(
  'consumedPointsIncrease',
  '消耗武蕴点',
  '每点按 0.1% 增伤计'
)

const emptySlot = (): TowerSkillSlotInput => ({ skillId: null, spirit: false })

const createEmptyBuild = (): TowerBuildInput => ({
  cycles: { metal: 0, fire: 0, wood: 0, earth: 0 },
  rareSkills: [emptySlot(), emptySlot(), emptySlot()],
  normalSkills: [emptySlot(), emptySlot(), emptySlot(), emptySlot()],
  offenseStats: Object.fromEntries(
    towerOffenseStatDefinitions.map((definition) => [definition.id, 0])
  ) as Record<TowerOffenseStatId, number>,
  defenseStats: Object.fromEntries(
    towerDefenseStatDefinitions.map((definition) => [definition.id, 0])
  ) as Record<TowerDefenseStatId, number>
})

const createWuyunInput = (): WuyunInput => ({
  enabled: Object.fromEntries(
    wuyunDefinitions.map((definition) => [definition.id, definition.defaultEnabled])
  ) as Record<WuyunSkillId, boolean>,
  values: Object.fromEntries(
    wuyunDefinitions.flatMap((definition) =>
      definition.valueFields.map((field) => [field.id, field.defaultValue] as const)
    )
  ) as Record<WuyunValueId, number>,
  consumedPoints: 30
})

const createDefaultBuild = (buildIndex: 0 | 1): TowerBuildInput => {
  const build = createEmptyBuild()

  build.cycles =
    buildIndex === 0
      ? { metal: 3, fire: 3, wood: 0, earth: 0 }
      : { metal: 3, fire: 0, wood: 0, earth: 0 }
  build.rareSkills =
    buildIndex === 0
      ? [
          { skillId: 'riYueLiangYi', spirit: true },
          { skillId: 'chengYingFengShuo', spirit: true },
          { skillId: 'jueDianJingSha', spirit: true }
        ]
      : [
          { skillId: 'zhuoXingGuanRi', spirit: false },
          { skillId: 'chengYingFengShuo', spirit: false },
          { skillId: 'jueDianJingSha', spirit: false }
        ]
  build.normalSkills =
    buildIndex === 0
      ? [
          { skillId: 'zhongMiao', spirit: false },
          { skillId: 'poFu', spirit: false },
          { skillId: 'duanHanMang', spirit: false },
          emptySlot()
        ]
      : [
          { skillId: 'zhongMiao', spirit: false },
          { skillId: 'chuKuangGe', spirit: false },
          { skillId: 'duanHanMang', spirit: false },
          emptySlot()
        ]

  for (const definition of towerOffenseStatDefinitions) {
    build.offenseStats[definition.id] = definition.defaultValues[buildIndex]
  }
  for (const definition of towerDefenseStatDefinitions) {
    build.defenseStats[definition.id] = definition.defaultValues[buildIndex]
  }

  return build
}

const createDefaultInput = (): TowerCalculatorInput => ({
  professionId: 'chaoguang',
  battleDurationSeconds: 120,
  morale: 7,
  offenseWeight: 0.65,
  defenseWeight: 0.35,
  builds: [createDefaultBuild(0), createDefaultBuild(1)],
  wuyun: createWuyunInput()
})

export const defaultTowerCalculatorInput: TowerCalculatorInput = createDefaultInput()

export const createEmptyTowerCalculatorInput = (): TowerCalculatorInput => ({
  ...createDefaultInput(),
  builds: [createEmptyBuild(), createEmptyBuild()]
})
