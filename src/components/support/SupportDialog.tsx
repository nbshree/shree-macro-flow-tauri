import { HeartHandshake, ShieldCheck, X } from 'lucide-react'
import type { RefObject } from 'react'

import donationQrCode from '../../assets/wechat-donation-qr.png'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'

type SupportDialogProps = {
  open: boolean
  returnFocusRef?: RefObject<HTMLButtonElement | null>
  onOpenChange: (open: boolean) => void
}

export function SupportDialog({
  open,
  returnFocusRef,
  onOpenChange
}: SupportDialogProps): React.JSX.Element {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="support-dialog"
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef?.current) return

          event.preventDefault()
          returnFocusRef.current.focus()
        }}
      >
        <header className="support-dialog__header">
          <span className="support-dialog__icon" aria-hidden="true">
            <HeartHandshake size={20} strokeWidth={1.8} />
          </span>
          <div>
            <DialogTitle>声明与支持</DialogTitle>
            <DialogDescription>免费软件不应成为欺骗和牟利的工具。</DialogDescription>
          </div>
          <Button
            aria-label="关闭声明与支持"
            className="support-dialog__close"
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            <X aria-hidden="true" size={18} strokeWidth={1.8} />
          </Button>
        </header>

        <div className="support-dialog__content">
          <section className="support-dialog__statement" aria-labelledby="support-statement-title">
            <div className="support-dialog__statement-heading">
              <ShieldCheck aria-hidden="true" size={20} strokeWidth={1.8} />
              <div>
                <span className="support-dialog__eyebrow">开源 · 完全免费</span>
                <h3 id="support-statement-title">谨防第三方倒卖</h3>
              </div>
            </div>
            <p>本软件开源、完全免费。凡是对外收费售卖本软件均为第三方倒卖，请谨防被骗。</p>
            <div className="support-dialog__voluntary-note">
              <p>打赏纯属自愿，不强制，不提供特权，感谢支持开发者！</p>
              <p className="support-dialog__contact">作者：401163814@qq.com</p>
            </div>
          </section>

          <section className="support-dialog__donation" aria-labelledby="support-donation-title">
            <div className="support-dialog__donation-heading">
              <h3 id="support-donation-title">微信扫码支持</h3>
              <span>感谢你的认可</span>
            </div>
            <div className="support-dialog__qr-frame">
              <img alt="开发者微信赞赏二维码" height="392" src={donationQrCode} width="392" />
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
