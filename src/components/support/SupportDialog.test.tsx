import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithUiProviders } from '@/test/test-utils'

import { SupportDialog } from './SupportDialog'

describe('SupportDialog', () => {
  it('shows the free-software statement and voluntary donation note', () => {
    renderWithUiProviders(<SupportDialog open onOpenChange={vi.fn()} />)

    expect(screen.getByText(/本软件开源、完全免费/)).toBeInTheDocument()
    expect(screen.getByText(/打赏纯属自愿，不强制，不提供特权/)).toBeInTheDocument()
    expect(screen.getByText('作者：401163814@qq.com')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '开发者微信赞赏二维码' })).toBeInTheDocument()
  })

  it('requests closing from the close button', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const returnFocusRef = createRef<HTMLButtonElement>()

    renderWithUiProviders(
      <>
        <button ref={returnFocusRef}>声明与支持</button>
        <SupportDialog open returnFocusRef={returnFocusRef} onOpenChange={onOpenChange} />
      </>
    )

    await user.click(screen.getByRole('button', { name: '关闭声明与支持' }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
