import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderWithUiProviders } from '@/test/test-utils'

import { TowerDemolitionCalculatorPage } from './TowerDemolitionCalculatorPage'
import { calculateTowerDemolition, defaultTowerCalculatorInput } from './domain'

describe('TowerDemolitionCalculatorPage', () => {
  it('loads the 4.1.1.3 Excel example and explains compatibility behavior', () => {
    renderWithUiProviders(<TowerDemolitionCalculatorPage />)
    const expectedBuilds = calculateTowerDemolition(defaultTowerCalculatorInput).builds

    expect(screen.getByText('Excel 兼容模式')).toBeVisible()
    expect(screen.getByText('含原表已知异常')).toBeVisible()
    expect(screen.getByText(/规则 4\.1\.1\.3/)).toBeVisible()

    expect(screen.getByRole('combobox', { name: '职业' })).toHaveTextContent('潮光')
    expect(screen.getByRole('spinbutton', { name: '战斗时长' })).toHaveValue(120)
    expect(screen.getByRole('spinbutton', { name: '局内士气' })).toHaveValue(7)
    expect(screen.getByRole('spinbutton', { name: '输出权重' })).toHaveValue(65)
    expect(screen.getByRole('spinbutton', { name: '坦度权重' })).toHaveValue(35)

    const first = screen.getByLabelText('第一套评分')
    expect(within(first).getByLabelText('第一套抗拆总分')).toHaveTextContent('9,000')
    expect(within(first).getByLabelText('第一套空拆总分')).toHaveTextContent('8,424')
    expect(within(first).getByText('3,237')).toBeVisible()
    expect(within(first).getByText('2,634')).toBeVisible()
    expect(within(first).getByText('776')).toBeVisible()
    const firstRangeCopy = within(first).getByLabelText('第一套原表区间说明')
    expect(within(firstRangeCopy).getByText('原表区间说明')).toBeVisible()
    expect(firstRangeCopy).toHaveTextContent(
      expectedBuilds[0].antiDemolitionRatingDetail.visibleDescription
    )
    expect(firstRangeCopy).toHaveTextContent(
      expectedBuilds[0].unopposedRatingDetail.visibleDescription
    )

    const second = screen.getByLabelText('第二套评分')
    expect(within(second).getByLabelText('第二套抗拆总分')).toHaveTextContent('7,609')
    expect(within(second).getByLabelText('第二套空拆总分')).toHaveTextContent('7,033')
    expect(within(second).getByText('3,547')).toBeVisible()
    expect(within(second).getByText('1,709')).toBeVisible()
    const secondRangeCopy = within(second).getByLabelText('第二套原表区间说明')
    expect(secondRangeCopy).toHaveTextContent(
      expectedBuilds[1].antiDemolitionRatingDetail.visibleDescription
    )
    expect(secondRangeCopy).toHaveTextContent(
      expectedBuilds[1].unopposedRatingDetail.visibleDescription
    )
    expect(
      within(second).getByText('兼容原表：顶部周天分与坦度分沿用第一套计算结果。')
    ).toBeVisible()
  })

  it('clears only the two builds and can restore the spreadsheet example', async () => {
    const user = userEvent.setup()
    renderWithUiProviders(<TowerDemolitionCalculatorPage />)

    const firstAttack = screen.getByRole('spinbutton', { name: '第一套攻击' })
    expect(firstAttack).toHaveValue(183)
    expect(screen.getByRole('combobox', { name: '怒浪惊涛（纯对单）' })).toHaveTextContent('有')

    await user.click(screen.getByRole('button', { name: '清空两套' }))

    expect(firstAttack).toHaveValue(0)
    expect(screen.getByRole('spinbutton', { name: '战斗时长' })).toHaveValue(120)
    expect(screen.getByRole('spinbutton', { name: '输出权重' })).toHaveValue(65)
    expect(screen.getByRole('combobox', { name: '怒浪惊涛（纯对单）' })).toHaveTextContent('有')

    await user.click(screen.getByRole('button', { name: '恢复表格示例' }))

    expect(firstAttack).toHaveValue(183)
    expect(screen.getByLabelText('第一套抗拆总分')).toHaveTextContent('9,000')
  }, 10_000)

  it('recalculates one build without overwriting the other build', async () => {
    const user = userEvent.setup()
    renderWithUiProviders(<TowerDemolitionCalculatorPage />)

    const secondAttack = screen.getByRole('spinbutton', { name: '第二套攻击' })
    await user.clear(secondAttack)
    await user.type(secondAttack, '200')

    expect(screen.getByLabelText('第一套抗拆总分')).toHaveTextContent('9,000')
    expect(screen.getByLabelText('第二套抗拆总分')).not.toHaveTextContent('7,609')
    expect(secondAttack).toHaveValue(200)
  }, 10_000)

  it('pauses only the affected scores when a field is invalid', async () => {
    const user = userEvent.setup()
    renderWithUiProviders(<TowerDemolitionCalculatorPage />)

    const duration = screen.getByRole('spinbutton', { name: '战斗时长' })
    await user.clear(duration)
    await user.type(duration, '0')

    expect(screen.getByRole('alert')).toHaveTextContent('战斗时长必须大于 0 秒。')
    expect(screen.getByText('评分暂不可用')).toBeVisible()
    expect(screen.getByText('场景收益')).toBeVisible()
    expect(screen.getByLabelText('怒浪惊涛（纯对单）1 高评分')).toBeVisible()
  })

  it('pauses both build and Wuyun results when the shared Xunying value is invalid', async () => {
    const user = userEvent.setup()
    renderWithUiProviders(<TowerDemolitionCalculatorPage />)

    const xunyingIncrease = screen.getByRole('spinbutton', {
      name: '巡影无锋增伤数值'
    })
    await user.clear(xunyingIncrease)
    await user.type(xunyingIncrease, '7')

    expect(screen.getByRole('alert')).toHaveTextContent('巡影无锋增伤数值不能低于 7.5%。')
    expect(screen.getByText('评分暂不可用')).toBeVisible()
    expect(screen.getByText('武蕴场景结果暂不可用')).toBeVisible()
    expect(screen.queryByLabelText('第一套抗拆总分')).not.toBeInTheDocument()
  })

  it('keeps build results available when a Wuyun-only value is invalid', async () => {
    const user = userEvent.setup()
    renderWithUiProviders(<TowerDemolitionCalculatorPage />)

    const suxueIncrease = screen.getByRole('spinbutton', {
      name: '溯雪凌霜增伤数值 1'
    })
    await user.clear(suxueIncrease)
    await user.type(suxueIncrease, '2')

    expect(screen.getByRole('alert')).toHaveTextContent('溯雪凌霜增伤数值 1不能低于 3%。')
    expect(screen.getByLabelText('第一套抗拆总分')).toHaveTextContent('9,000')
    expect(screen.queryByText('评分暂不可用')).not.toBeInTheDocument()
    expect(screen.getByText('武蕴场景结果暂不可用')).toBeVisible()
  })

  it('keeps Wuyun scenarios independent from the two build totals', async () => {
    const user = userEvent.setup()
    renderWithUiProviders(<TowerDemolitionCalculatorPage />)

    const firstTotal = screen.getByLabelText('第一套抗拆总分')
    const fullHealthScenario = screen.getByLabelText('溯雪凌霜满血塔评分')
    const previousScenarioScore = fullHealthScenario.textContent

    const baiZhan = screen.getByRole('combobox', { name: '百战魂' })
    await user.click(baiZhan)
    await user.click(await screen.findByRole('option', { name: '有' }))

    expect(firstTotal).toHaveTextContent('9,000')
    expect(screen.getByLabelText('溯雪凌霜满血塔评分')).not.toHaveTextContent(
      previousScenarioScore ?? ''
    )
    expect(screen.getByText('独立参考工具，不计入两套内功总分')).toBeVisible()
    expect(screen.queryByText(/AI 配置/)).not.toBeInTheDocument()
  })
})
