import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { renderWithUiProviders } from '@/test/test-utils'

import { InternalSkillCalculatorPage } from './InternalSkillCalculatorPage'

describe('InternalSkillCalculatorPage', () => {
  it('starts empty without an example-loading action', () => {
    renderWithUiProviders(<InternalSkillCalculatorPage />)

    expect(screen.getByRole('status')).toHaveTextContent('填写属性或选择内功后查看评估结果')
    expect(screen.queryByRole('button', { name: '载入示例' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清空全部' })).toBeDisabled()
  })

  it('shows a readable tier after entering a score and can clear the draft', async () => {
    const user = userEvent.setup()
    renderWithUiProviders(<InternalSkillCalculatorPage />)

    const factionRestraint = screen.getByRole('spinbutton', { name: '流派克制' })
    await user.clear(factionRestraint)
    await user.type(factionRestraint, '70')

    const summary = screen.getByLabelText('综合评分')
    expect(within(summary).getByText('70.00')).toBeInTheDocument()
    expect(within(summary).getByText('哥布林精英')).toHaveClass('calculator-tier-badge')

    const clearButton = screen.getByRole('button', { name: '清空全部' })
    expect(clearButton).toBeEnabled()
    await user.click(clearButton)

    expect(screen.getByRole('status')).toHaveTextContent('填写属性或选择内功后查看评估结果')
    expect(screen.queryByText('建议转生')).not.toBeInTheDocument()
  })

  it('keeps the result empty when only the cycle changes and lets the user reset it', async () => {
    const user = userEvent.setup()
    renderWithUiProviders(<InternalSkillCalculatorPage />)

    const cycleSelect = screen.getByRole('combobox', { name: '周天组合' })
    cycleSelect.focus()
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('option', { name: '火木（+2.70 分）' })).toBeInTheDocument()
    await user.keyboard('{ArrowDown}{Enter}')

    expect(screen.getByRole('status')).toHaveTextContent('填写属性或选择内功后查看评估结果')
    expect(screen.getByRole('button', { name: '清空全部' })).toBeEnabled()
  })

  it('recalculates when a skill is selected', async () => {
    const user = userEvent.setup()
    renderWithUiProviders(<InternalSkillCalculatorPage />)

    await user.click(screen.getByText('携带承影锋镝'))

    const summary = screen.getByLabelText('综合评分')
    expect(within(summary).getByText('6.00')).toBeInTheDocument()
  })
})
