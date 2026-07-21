import {
  AlertCircle,
  CheckCircle2,
  Download,
  LoaderCircle,
  RefreshCw,
  ShieldAlert
} from 'lucide-react'
import type { RefObject } from 'react'

import type { AppUpdaterController } from '../../hooks/useAppUpdater'
import { Alert, AlertDescription } from '../ui/alert'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'

type UpdateDialogProps = {
  updater: AppUpdaterController
  returnFocusRef?: RefObject<HTMLButtonElement | null>
}

function formatPublishedAt(value: string | null): string | null {
  if (!value) return null
  const publishedAt = new Date(value)
  if (Number.isNaN(publishedAt.getTime())) return value
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(publishedAt)
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function UpdateDialog({ updater, returnFocusRef }: UpdateDialogProps): React.JSX.Element {
  const publishedAt = formatPublishedAt(updater.update?.publishedAt ?? null)
  const displayedProgressPercent = updater.status === 'installing' ? 100 : updater.progressPercent
  const progressLabel =
    updater.total === null
      ? `已下载 ${formatBytes(updater.downloaded)}`
      : `${formatBytes(updater.downloaded)} / ${formatBytes(updater.total)}`

  return (
    <Dialog open={updater.open} onOpenChange={updater.setOpen}>
      <DialogContent
        aria-busy={updater.isBusy}
        className="update-dialog"
        showCloseButton={!updater.isBusy}
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef?.current) return
          event.preventDefault()
          returnFocusRef.current.focus()
        }}
        onEscapeKeyDown={(event) => {
          if (updater.status === 'downloading' || updater.status === 'installing') {
            event.preventDefault()
          }
        }}
        onPointerDownOutside={(event) => {
          if (updater.status === 'downloading' || updater.status === 'installing') {
            event.preventDefault()
          }
        }}
      >
        {updater.status === 'checking' ? (
          <div className="update-dialog__state" role="status">
            <LoaderCircle className="update-dialog__spinner" aria-hidden="true" />
            <DialogHeader>
              <DialogTitle>正在检查更新</DialogTitle>
              <DialogDescription>正在连接更新服务器，请稍候。</DialogDescription>
            </DialogHeader>
          </div>
        ) : null}

        {updater.status === 'upToDate' ? (
          <>
            <div className="update-dialog__state update-dialog__state--success" role="status">
              <CheckCircle2 aria-hidden="true" />
              <DialogHeader>
                <DialogTitle>已经是最新版</DialogTitle>
                <DialogDescription>
                  当前版本 v{updater.currentVersion ?? '未知'}，暂无可用更新。
                </DialogDescription>
              </DialogHeader>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => updater.setOpen(false)}>
                关闭
              </Button>
              <Button type="button" onClick={() => void updater.checkForUpdate()}>
                <RefreshCw aria-hidden="true" />
                重新检查
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {updater.status === 'available' && updater.update ? (
          <>
            <div className="update-dialog__heading">
              <span className="update-dialog__icon" aria-hidden="true">
                <Download />
              </span>
              <DialogHeader>
                <DialogTitle>发现新版本 v{updater.update.version}</DialogTitle>
                <DialogDescription>
                  当前版本 v{updater.currentVersion ?? '未知'}
                  {publishedAt ? ` · 发布于 ${publishedAt}` : ''}
                </DialogDescription>
              </DialogHeader>
            </div>

            <section
              className="update-dialog__notes"
              aria-labelledby="update-notes-title"
              tabIndex={0}
            >
              <h3 id="update-notes-title">更新内容</h3>
              <p>{updater.update.notes || '本次更新暂无详细说明。'}</p>
            </section>

            {updater.installBlockedReason ? (
              <Alert className="update-dialog__warning">
                <ShieldAlert aria-hidden="true" />
                <AlertDescription>{updater.installBlockedReason}</AlertDescription>
              </Alert>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => updater.setOpen(false)}>
                稍后更新
              </Button>
              <Button
                disabled={Boolean(updater.installBlockedReason)}
                type="button"
                onClick={() => void updater.installUpdate()}
              >
                <Download aria-hidden="true" />
                立即更新
              </Button>
            </DialogFooter>
          </>
        ) : null}

        {updater.status === 'downloading' || updater.status === 'installing' ? (
          <div className="update-dialog__download" role="status">
            <LoaderCircle className="update-dialog__spinner" aria-hidden="true" />
            <DialogHeader>
              <DialogTitle>
                {updater.status === 'installing' ? '正在安装更新' : '正在下载更新'}
              </DialogTitle>
              <DialogDescription>
                {updater.status === 'installing'
                  ? '应用即将退出，安装完成后会自动重新启动。'
                  : '请保持应用开启。下载完成后会自动安装并重启。'}
              </DialogDescription>
            </DialogHeader>
            <div
              aria-label="更新下载进度"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={displayedProgressPercent ?? undefined}
              className="update-dialog__progress"
              role="progressbar"
            >
              <span style={{ width: `${displayedProgressPercent ?? 0}%` }} />
            </div>
            <p className="update-dialog__progress-label">
              <span>{progressLabel}</span>
              <strong>
                {updater.status === 'installing'
                  ? '下载完成'
                  : updater.progressPercent === null
                    ? '下载中'
                    : `${updater.progressPercent}%`}
              </strong>
            </p>
          </div>
        ) : null}

        {updater.status === 'error' ? (
          <>
            <div className="update-dialog__state update-dialog__state--error" role="alert">
              <AlertCircle aria-hidden="true" />
              <DialogHeader>
                <DialogTitle>更新未完成</DialogTitle>
                <DialogDescription>{updater.error}</DialogDescription>
              </DialogHeader>
            </div>
            {updater.retryBlockedReason ? (
              <Alert className="update-dialog__warning">
                <ShieldAlert aria-hidden="true" />
                <AlertDescription>{updater.retryBlockedReason}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => updater.setOpen(false)}>
                关闭
              </Button>
              <Button
                disabled={Boolean(updater.retryBlockedReason)}
                type="button"
                onClick={() => void updater.retry()}
              >
                <RefreshCw aria-hidden="true" />
                重试
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
