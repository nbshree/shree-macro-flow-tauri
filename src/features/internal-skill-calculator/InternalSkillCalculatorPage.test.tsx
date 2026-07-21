import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createMacroApi, renderWithUiProviders } from '@/test/test-utils'

import { InternalSkillCalculatorPage } from './InternalSkillCalculatorPage'

describe('InternalSkillCalculatorPage', () => {
  it('starts empty without an example-loading action', () => {
    renderWithUiProviders(<InternalSkillCalculatorPage />)

    expect(
      screen.getByText((_, element) =>
        Boolean(
          element?.classList.contains('calculator-paste-hint__copy') &&
          element.textContent?.includes('复制内功面板截图，按 Ctrl+V 即可计算')
        )
      )
    ).toBeVisible()
    expect(screen.getByText('Ctrl+V')).toHaveProperty('tagName', 'KBD')
    expect(screen.getByRole('button', { name: '查看截图示例' })).toHaveTextContent('截图示例')
    expect(screen.getByText('规则 7.20')).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent('填写属性或选择内功后查看评估结果')
    expect(screen.queryByRole('button', { name: '载入示例' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '清空全部' })).toBeDisabled()
  })

  it('shows the screenshot example from the toolbar help button', async () => {
    const user = userEvent.setup()
    renderWithUiProviders(<InternalSkillCalculatorPage />)

    const helpButton = screen.getByRole('button', { name: '查看截图示例' })
    await user.hover(helpButton)

    const tooltip = await screen.findByRole('tooltip')
    expect(within(tooltip).getByText('截图示例')).toBeVisible()
    expect(within(tooltip).getByText('复制包含属性和内功图标的完整面板')).toBeVisible()
    expect(
      within(tooltip).getByRole('img', { name: '包含属性和内功图标的完整内功面板示例' })
    ).toHaveAttribute('src', expect.stringContaining('internal-skill-panel-example'))

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })

  it('shows a readable tier after entering a score and can clear the draft', async () => {
    const user = userEvent.setup()
    renderWithUiProviders(<InternalSkillCalculatorPage />)

    const factionRestraint = screen.getByRole('spinbutton', { name: '流派克制' })
    await user.clear(factionRestraint)
    await user.type(factionRestraint, '75')

    const summary = screen.getByLabelText('综合评分')
    expect(within(summary).getByText('70.50')).toBeInTheDocument()
    expect(summary.querySelector('.calculator-tier-badge')).toHaveTextContent('泰斗')
    const tierGuide = within(summary).getByRole('list', { name: '综合评分档位说明' })
    expect(within(tierGuide).getByText('57%以下')).toBeInTheDocument()
    expect(within(tierGuide).getByText('57%~63%')).toBeInTheDocument()
    expect(within(tierGuide).getByText('63%~70%')).toBeInTheDocument()
    expect(within(tierGuide).getByText('70%+')).toBeInTheDocument()
    expect(within(tierGuide).getByText('泰斗').closest('li')).toHaveAttribute(
      'aria-current',
      'true'
    )

    const clearButton = screen.getByRole('button', { name: '清空全部' })
    expect(clearButton).toBeEnabled()
    await user.click(clearButton)

    expect(screen.getByRole('status')).toHaveTextContent('填写属性或选择内功后查看评估结果')
    expect(screen.queryByText('建议转生')).not.toBeInTheDocument()
  })

  it('does not render the removed cycle controls', () => {
    renderWithUiProviders(<InternalSkillCalculatorPage />)

    expect(screen.queryByRole('combobox', { name: '周天组合' })).not.toBeInTheDocument()
    expect(screen.queryByText('周天收益计入特性分')).not.toBeInTheDocument()
  })

  it('recalculates when a skill is selected', async () => {
    const user = userEvent.setup()
    renderWithUiProviders(<InternalSkillCalculatorPage />)

    await user.click(screen.getByText('携带承影锋烁'))

    const summary = screen.getByLabelText('综合评分')
    expect(within(summary).getByText('6.00')).toBeInTheDocument()
  })

  it('validates and saves a mystery code', async () => {
    const user = userEvent.setup()
    const api = createMacroApi()
    renderWithUiProviders(<InternalSkillCalculatorPage active api={api} />)

    await user.click(screen.getByRole('button', { name: 'AI 配置' }))
    await user.type(screen.getByLabelText('神秘代码'), 'shree')
    await user.click(screen.getByRole('button', { name: '保存并验证' }))

    await waitFor(() =>
      expect(api.saveAndValidateMysteryCode).toHaveBeenCalledWith('shree', 'https://gzxsy.vip', '')
    )
    expect(await screen.findByText('AI 识别服务验证成功。')).toBeVisible()
    expect(screen.queryByLabelText('模型名称')).not.toBeInTheDocument()
  })

  it('accepts a custom API key without exposing model configuration', async () => {
    const user = userEvent.setup()
    const api = createMacroApi()
    renderWithUiProviders(<InternalSkillCalculatorPage active api={api} />)

    await user.click(screen.getByRole('button', { name: 'AI 配置' }))
    await user.type(screen.getByLabelText('API Key（可选）'), 'sk-custom')
    await user.click(screen.getByRole('button', { name: '保存并验证' }))

    await waitFor(() =>
      expect(api.saveAndValidateMysteryCode).toHaveBeenCalledWith(
        '',
        'https://gzxsy.vip',
        'sk-custom'
      )
    )
  })

  it('offers the API provider registration link', async () => {
    const user = userEvent.setup()
    const api = createMacroApi()
    renderWithUiProviders(<InternalSkillCalculatorPage active api={api} />)

    await user.click(screen.getByRole('button', { name: 'AI 配置' }))

    await user.click(screen.getByRole('button', { name: '通过邀请链接注册中转站' }))

    expect(api.openAiProviderRegistration).toHaveBeenCalledOnce()
  })

  it('allows the AI base URL to be configured', async () => {
    const user = userEvent.setup()
    const api = createMacroApi()
    renderWithUiProviders(<InternalSkillCalculatorPage active api={api} />)

    await user.click(screen.getByRole('button', { name: 'AI 配置' }))
    const baseUrl = screen.getByLabelText('Base URL')
    await user.clear(baseUrl)
    await user.type(baseUrl, 'https://api.example.com/')
    await user.type(screen.getByLabelText('神秘代码'), 'shree')
    await user.click(screen.getByRole('button', { name: '保存并验证' }))

    await waitFor(() =>
      expect(api.saveAndValidateMysteryCode).toHaveBeenCalledWith(
        'shree',
        'https://api.example.com/',
        ''
      )
    )
  })

  it('shows an error when the mapped API key is unusable', async () => {
    const user = userEvent.setup()
    const api = createMacroApi()
    api.saveAndValidateMysteryCode.mockRejectedValue(
      new Error('神秘代码对应的 API Key 无效：AI 识别服务请求失败（401 Unauthorized）')
    )
    renderWithUiProviders(<InternalSkillCalculatorPage active api={api} />)

    await user.click(screen.getByRole('button', { name: 'AI 配置' }))
    await user.type(screen.getByLabelText('神秘代码'), 'expired')
    await user.click(screen.getByRole('button', { name: '保存并验证' }))

    expect(await screen.findByText(/API Key 无效/)).toBeVisible()
    expect(screen.getByRole('dialog')).toBeVisible()
  })

  it('deletes a configured mystery code', async () => {
    const user = userEvent.setup()
    const api = createMacroApi()
    api.getMysteryCodeStatus.mockResolvedValue({
      configured: true,
      lastFour: 'hree',
      baseUrl: 'https://gzxsy.vip'
    })
    renderWithUiProviders(<InternalSkillCalculatorPage active api={api} />)

    await waitFor(() => expect(api.getMysteryCodeStatus).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'AI 配置' }))
    expect(screen.getByText('当前神秘代码尾号 hree')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '删除 AI 凭据' }))

    await waitFor(() => expect(api.deleteMysteryCode).toHaveBeenCalled())
    expect(await screen.findByText('已删除 AI 凭据。')).toBeVisible()
  })

  it('asks for a mystery code before accepting a pasted image', async () => {
    const api = createMacroApi()
    renderWithUiProviders(<InternalSkillCalculatorPage active api={api} />)

    await waitFor(() => expect(api.getMysteryCodeStatus).toHaveBeenCalled())
    fireEvent.paste(window, clipboardEventWithImage())

    expect(await screen.findByText('请先配置有效的神秘代码或 API Key。')).toBeVisible()
    expect(api.recognizeInternalSkillImage).not.toHaveBeenCalled()
  })

  it('downscales and converts a pasted screenshot to webp before recognition', async () => {
    const api = createMacroApi()
    api.getMysteryCodeStatus.mockResolvedValue({
      configured: true,
      lastFour: '1234',
      baseUrl: 'https://gzxsy.vip'
    })
    const close = vi.fn()
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 2560, height: 1369, close }) as unknown as ImageBitmap)
    )
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) => callback(new Blob(['webp'], { type: 'image/webp' })))

    try {
      renderWithUiProviders(<InternalSkillCalculatorPage active api={api} />)
      await waitFor(() => expect(api.getMysteryCodeStatus).toHaveBeenCalled())
      fireEvent.paste(window, clipboardEventWithImage())

      await waitFor(() => expect(api.recognizeInternalSkillImage).toHaveBeenCalled())
      expect(api.recognizeInternalSkillImage.mock.calls[0][0]).toMatch(/^data:image\/webp;base64,/)
      expect(close).toHaveBeenCalled()
    } finally {
      getContext.mockRestore()
      toBlob.mockRestore()
      vi.unstubAllGlobals()
    }
  })

  it('recognizes a pasted image, overwrites the draft, and preserves spirit selections', async () => {
    const user = userEvent.setup()
    const api = createMacroApi()
    api.getMysteryCodeStatus.mockResolvedValue({
      configured: true,
      lastFour: '1234',
      baseUrl: 'https://gzxsy.vip'
    })
    api.recognizeInternalSkillImage.mockResolvedValue({
      baseStats: {
        season: 8,
        strengthOrQi: 36,
        attack: 237,
        armorPenetration: 83,
        factionRestraint: 4.7,
        criticalHit: 127,
        maxAttack: 86,
        minAttack: 36,
        agility: 0,
        endurance: 0,
        constitution: 0
      },
      equippedSkillIds: ['zhongMiao', 'chengYingFengShuo']
    })
    renderWithUiProviders(<InternalSkillCalculatorPage active api={api} />)

    await waitFor(() => expect(api.getMysteryCodeStatus).toHaveBeenCalled())
    await user.click(screen.getByText('众妙灵'))
    fireEvent.paste(window, clipboardEventWithImage())

    await waitFor(() => expect(api.recognizeInternalSkillImage).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('spinbutton', { name: '攻击' })).toHaveValue(237))
    expect(screen.getByRole('switch', { name: '携带众妙' })).toBeChecked()
    expect(screen.getByRole('switch', { name: '携带承影锋烁' })).toBeChecked()
    expect(screen.getByRole('switch', { name: '众妙灵' })).toBeChecked()
    expect(screen.queryByRole('combobox', { name: '周天组合' })).not.toBeInTheDocument()
    expect(screen.getByText('灵状态需要手动配置。')).toHaveClass(
      'calculator-recognition-manual-notice'
    )
  })

  it('keeps existing values when image recognition fails', async () => {
    const user = userEvent.setup()
    const api = createMacroApi()
    api.getMysteryCodeStatus.mockResolvedValue({
      configured: true,
      lastFour: '1234',
      baseUrl: 'https://gzxsy.vip'
    })
    api.recognizeInternalSkillImage.mockRejectedValue(new Error('接口超时'))
    renderWithUiProviders(<InternalSkillCalculatorPage active api={api} />)

    const attack = screen.getByRole('spinbutton', { name: '攻击' })
    await user.clear(attack)
    await user.type(attack, '99')
    await waitFor(() => expect(api.getMysteryCodeStatus).toHaveBeenCalled())
    fireEvent.paste(window, clipboardEventWithImage())

    expect(await screen.findByText('接口超时')).toBeVisible()
    expect(attack).toHaveValue(99)
  })
})

function clipboardEventWithImage() {
  const image = new File(['png'], 'screenshot.png', { type: 'image/png' })
  return {
    clipboardData: {
      items: [
        {
          kind: 'file',
          type: 'image/png',
          getAsFile: () => image
        }
      ]
    }
  }
}
