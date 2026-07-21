import { describe, expect, it } from 'vitest'

import {
  calculateTowerDemolition,
  createEmptyTowerCalculatorInput,
  defaultTowerCalculatorInput,
  towerExcelCompatibilityConstants,
  towerNormalSkillDefinitions,
  towerRareSkillDefinitions,
  towerSkillDefinitions,
  type TowerCalculatorInput,
  type TowerSkillId,
  type WuyunScenarioId
} from './index'

const cloneDefaultInput = (): TowerCalculatorInput => structuredClone(defaultTowerCalculatorInput)

const getDynamicScore = (
  result: ReturnType<typeof calculateTowerDemolition>,
  buildIndex: 0 | 1,
  skillId: TowerSkillId
) => result.builds[buildIndex].dynamicSkillResults.find((item) => item.id === skillId)?.score ?? 0

describe('tower demolition 4.1.1.3 Excel-compatible rules', () => {
  it('exports the complete dynamic table and the original selector ranges', () => {
    expect(towerSkillDefinitions).toHaveLength(23)
    expect(towerRareSkillDefinitions.map((item) => item.label)).toEqual([
      '灼星贯日',
      '承影锋烁',
      '日月两仪',
      '绝电惊沙'
    ])
    expect(towerNormalSkillDefinitions).toHaveLength(17)
    expect(towerNormalSkillDefinitions.map((item) => item.label)).not.toContain('覆沙阙')
    expect(towerNormalSkillDefinitions.map((item) => item.label)).not.toContain('征袍')
  })

  it('reproduces both cached Excel headline scores and ratings', () => {
    const result = calculateTowerDemolition(cloneDefaultInput())
    const first = result.builds[0]
    const second = result.builds[1]

    expect([
      first.dynamicSkillScore,
      first.cycleScore,
      first.offenseStatScore,
      first.defenseStatScore,
      first.spiritScore
    ]).toEqual([3237, 1777, 2634, 576, 776])
    expect([first.antiDemolitionScore, first.unopposedScore]).toEqual([9000, 8424])
    expect(first.antiDemolitionRating).toBe('拆之巅、傲世间')
    expect(first.unopposedRating).toBe('合格塔兵')

    expect([
      second.dynamicSkillScore,
      second.cycleScore,
      second.offenseStatScore,
      second.defenseStatScore,
      second.spiritScore
    ]).toEqual([3547, 1777, 1709, 576, 0])
    expect([second.antiDemolitionScore, second.unopposedScore]).toEqual([7609, 7033])
    expect(second.antiDemolitionRating).toBe('饮水机管理员')
    expect(second.unopposedRating).toBe('饮水机管理员')
  })

  it('reproduces all 23 cached dynamic-skill rows for both builds', () => {
    const result = calculateTowerDemolition(cloneDefaultInput())
    const firstScores = Object.fromEntries(
      result.builds[0].dynamicSkillResults.map((item) => [item.id, item.score])
    )
    const secondScores = Object.fromEntries(
      result.builds[1].dynamicSkillResults.map((item) => [item.id, item.score])
    )

    expect(firstScores).toEqual({
      zhuoXingGuanRi: 678,
      chengYingFengShuo: 695,
      riYueLiangYi: 477,
      jueDianJingSha: 550,
      poFu: 510,
      jiShuai: 434,
      guanShanYue: 280,
      jingYu: 470,
      duanHanMang: 500,
      poZhongYun: 492,
      lingQiong: 450,
      cangLangXing: 431,
      caiFeng: 480,
      zhongMiao: 505,
      zhanJing: 456,
      chuKuangGe: 530,
      fenRen: 100,
      wuYunYao: 159,
      naBaiGuan: 395,
      guLei: 82,
      yuQianZhang: 242,
      fuShaQue: 150,
      zhengPao: 242
    })
    expect(secondScores).toEqual({
      zhuoXingGuanRi: 708,
      chengYingFengShuo: 760,
      riYueLiangYi: 538,
      jueDianJingSha: 550,
      poFu: 510,
      jiShuai: 418,
      guanShanYue: 280,
      jingYu: 470,
      duanHanMang: 500,
      poZhongYun: 492,
      lingQiong: 450,
      cangLangXing: 519,
      caiFeng: 480,
      zhongMiao: 499,
      zhanJing: 439,
      chuKuangGe: 530,
      fenRen: 100,
      wuYunYao: 192,
      naBaiGuan: 432,
      guLei: 41,
      yuQianZhang: 242,
      fuShaQue: 150,
      zhengPao: 242
    })
  })

  it('keeps second-build own details alongside the cross-build headline references', () => {
    const second = calculateTowerDemolition(cloneDefaultInput()).builds[1]

    expect(second.ownCycleScore).toBe(784)
    expect(second.reportedCycleScore).toBe(1777)
    expect(second.ownDefenseStatScore).toBe(687)
    expect(second.reportedDefenseStatScore).toBe(576)
    expect(second.ownAntiDemolitionScore).toBe(6727)
    expect(second.ownUnopposedScore).toBe(6040)
  })

  it('preserves the negative 2-wood typo including its trailing weighting constants', () => {
    const input = createEmptyTowerCalculatorInput()
    input.builds[0].cycles.wood = 2

    const result = calculateTowerDemolition(input)

    expect(result.builds[0].cycleScores.wood).toBe(-2353)
    expect(result.builds[0].ownCycleScore).toBe(-2353)
  })

  it('keeps the second 五蕴谣 spirit denominator coupled to the first build', () => {
    const input = createEmptyTowerCalculatorInput()
    input.builds[1].normalSkills[0] = { skillId: 'wuYunYao', spirit: true }
    input.builds[1].cycles.fire = 3

    const initial = calculateTowerDemolition(input)
    expect(initial.builds[1].spiritScore).toBe(146)

    input.builds[1].cycles.fire = 0
    const changedSecondOnly = calculateTowerDemolition(input)
    expect(changedSecondOnly.builds[1].spiritScore).toBe(146)

    input.builds[0].cycles.fire = 3
    const changedFirst = calculateTowerDemolition(input)
    expect(changedFirst.builds[1].spiritScore).not.toBe(146)
  })

  it('freezes broken references and unavailable external caches at their workbook values', () => {
    expect(towerExcelCompatibilityConstants).toMatchObject({
      brokenReferenceFallback: 0,
      externalArmorPenetrationCache: 10,
      externalNaBaiGuanAmplificationCache: 0
    })
  })

  it('keeps both season-enhancement scores coupled to the second build total amplification', () => {
    const input = cloneDefaultInput()
    for (const build of input.builds) {
      for (const statId of Object.keys(build.offenseStats) as (keyof typeof build.offenseStats)[]) {
        build.offenseStats[statId] = 0
      }
      build.offenseStats.seasonEnhancement = 0.017
    }

    const baseline = calculateTowerDemolition(input)
    expect(baseline.builds[0].offenseStatScore).toBe(baseline.builds[1].offenseStatScore)

    input.builds[1].cycles.fire = 3
    input.builds[1].normalSkills[3] = { skillId: 'naBaiGuan', spirit: false }
    const changedSecondAmplification = calculateTowerDemolition(input)

    expect(changedSecondAmplification.builds[0].offenseStatScore).toBe(
      changedSecondAmplification.builds[1].offenseStatScore
    )
    expect(changedSecondAmplification.builds[0].offenseStatScore).toBeLessThan(
      baseline.builds[0].offenseStatScore
    )
    expect(changedSecondAmplification.shared.offenseMarginalGains.seasonEnhancement).toBeLessThan(
      baseline.shared.offenseMarginalGains.seasonEnhancement
    )
  })

  it('keeps profession, duration, morale and Wuyun switches live', () => {
    const input = cloneDefaultInput()
    const baseline = calculateTowerDemolition(input)

    input.professionId = 'xuehe'
    const xuehe = calculateTowerDemolition(input)
    expect(xuehe.shared.offenseMarginalGains.attack).toBeGreaterThan(
      baseline.shared.offenseMarginalGains.attack
    )

    input.professionId = 'longyin'
    const longyin = calculateTowerDemolition(input)
    expect(longyin.shared.offenseMarginalGains.armorPenetration).not.toBe(
      baseline.shared.offenseMarginalGains.armorPenetration
    )

    input.professionId = 'chaoguang'
    input.battleDurationSeconds = 60
    expect(calculateTowerDemolition(input).builds[0].cycleScores.fire).not.toBe(
      baseline.builds[0].cycleScores.fire
    )

    input.morale = 0
    input.wuyun.enabled.xunYingWuFeng = false
    expect(getDynamicScore(calculateTowerDemolition(input), 0, 'poZhongYun')).toBeGreaterThan(
      getDynamicScore(baseline, 0, 'poZhongYun')
    )
  })

  it('reproduces every default Wuyun scenario score without folding it into build totals', () => {
    const result = calculateTowerDemolition(cloneDefaultInput())
    const expectedScores: Record<WuyunScenarioId, number> = {
      nuLangHighGround: 1333,
      nuLangOuterTower: 840,
      nuLangBossOrThreeHigh: 333,
      baJianLowPressure: 588,
      baJianContested: 680,
      yanGuangUnopposed: 400,
      yanGuangContested: 506,
      zhenLongUnopposedRageArmor: 440,
      zhenLongUnopposedNoRageArmor: 400,
      zhenLongContestedRageArmor: 532,
      zhenLongContestedYueFeiRageArmor: 557,
      xunYingFirstTower: 785,
      xunYingAverageOrSecondTower: 669,
      xunYingHighGround: 602,
      suXueFullHealthTower: 583,
      suXueHalfHealthTower: 689,
      baiZhanWithRageArmor: 614,
      baiZhanWithoutRageArmor: 548,
      liuGuangExpected: 360,
      consumedPointsIncrease: 300
    }

    expect(result.wuyun.scenarios).toHaveLength(20)
    expect(
      Object.fromEntries(result.wuyun.scenarios.map((scenario) => [scenario.id, scenario.score]))
    ).toEqual(expectedScores)
    expect(result.builds[0].antiDemolitionScore).toBe(9000)
  })

  it('preserves the limited yes/no cross-links instead of zeroing disabled Wuyun rows', () => {
    const input = cloneDefaultInput()
    const disabledYanGuang = calculateTowerDemolition(input)
    expect(disabledYanGuang.wuyun.byId.yanGuangUnopposed.score).toBe(400)

    const withoutBaiZhan = disabledYanGuang.wuyun.byId.suXueFullHealthTower.score
    input.wuyun.enabled.baiZhanHun = true
    const withBaiZhan = calculateTowerDemolition(input).wuyun.byId.suXueFullHealthTower.score
    expect(withBaiZhan).not.toBe(withoutBaiZhan)
  })

  it('creates independent empty build data while retaining shared defaults', () => {
    const first = createEmptyTowerCalculatorInput()
    const second = createEmptyTowerCalculatorInput()
    first.builds[0].rareSkills[0].skillId = 'zhuoXingGuanRi'
    first.builds[0].offenseStats.attack = 33

    expect(second.builds[0].rareSkills[0].skillId).toBeNull()
    expect(second.builds[0].offenseStats.attack).toBe(0)
    expect(second.professionId).toBe('chaoguang')
    expect(second.wuyun.consumedPoints).toBe(30)
  })
})
