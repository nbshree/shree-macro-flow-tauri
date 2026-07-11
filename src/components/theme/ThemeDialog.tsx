import { Check, ImageOff, LoaderCircle, Palette, X } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react'

import {
  isThemeId,
  normalizeAppearance,
  themes,
  useTheme,
  type AppearanceInput,
  type AppearancePreferences,
  type ThemeId
} from '../../themes'
import { Alert, AlertDescription } from '../ui/alert'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog'
import { RadioGroup, RadioGroupItem } from '../ui/radio-group'
import { Switch } from '../ui/switch'

export type ThemeDialogProps = {
  open: boolean
  appearance?: AppearanceInput | null
  returnFocusRef?: RefObject<HTMLButtonElement | null>
  onOpenChange: (open: boolean) => void
  onApply: (appearance: AppearancePreferences) => unknown | Promise<unknown>
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return '请稍后重试，或重新打开主题设置。'
}

export function ThemeDialog({
  open,
  appearance,
  returnFocusRef,
  onOpenChange,
  onApply
}: ThemeDialogProps) {
  const selectedThemeRef = useRef<HTMLButtonElement>(null)
  const cleanModeId = useId()
  const {
    appearance: providerAppearance,
    resetPreviewAppearance,
    setPreviewAppearance
  } = useTheme()
  const sourceAppearance = useMemo(
    () => normalizeAppearance(appearance ?? providerAppearance),
    [
      appearance?.cleanMode,
      appearance?.themeId,
      providerAppearance.cleanMode,
      providerAppearance.themeId
    ]
  )
  const [draft, setDraft] = useState<AppearancePreferences>(sourceAppearance)
  const [brokenPreviews, setBrokenPreviews] = useState<Set<ThemeId>>(() => new Set())
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setDraft(sourceAppearance)
      resetPreviewAppearance()
      return
    }

    setDraft(sourceAppearance)
    setBrokenPreviews(new Set())
    setError(null)
    setPreviewAppearance(sourceAppearance)
  }, [
    open,
    resetPreviewAppearance,
    setPreviewAppearance,
    sourceAppearance.cleanMode,
    sourceAppearance.themeId
  ])

  const updateDraft = useCallback(
    (patch: Partial<AppearancePreferences>) => {
      const nextAppearance = { ...draft, ...patch }
      setDraft(nextAppearance)
      setError(null)
      setPreviewAppearance(nextAppearance)
    },
    [draft, setPreviewAppearance]
  )

  const cancel = useCallback(() => {
    if (isSaving) return

    setDraft(sourceAppearance)
    setError(null)
    resetPreviewAppearance()
    onOpenChange(false)
  }, [isSaving, onOpenChange, resetPreviewAppearance, sourceAppearance])

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) {
        onOpenChange(true)
        return
      }

      cancel()
    },
    [cancel, onOpenChange]
  )

  const apply = useCallback(async () => {
    if (isSaving) return

    setIsSaving(true)
    setError(null)

    try {
      await onApply(draft)
      resetPreviewAppearance()
      onOpenChange(false)
    } catch (nextError) {
      setDraft(sourceAppearance)
      resetPreviewAppearance()
      setError(`保存主题失败：${getErrorMessage(nextError)}`)
    } finally {
      setIsSaving(false)
    }
  }, [draft, isSaving, onApply, onOpenChange, resetPreviewAppearance, sourceAppearance])

  const markPreviewAsBroken = useCallback((themeId: ThemeId) => {
    setBrokenPreviews((current) => {
      if (current.has(themeId)) return current

      const next = new Set(current)
      next.add(themeId)
      return next
    })
  }, [])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        aria-busy={isSaving}
        className="theme-dialog"
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (isSaving) event.preventDefault()
        }}
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef?.current) return

          event.preventDefault()
          returnFocusRef.current.focus()
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          selectedThemeRef.current?.focus()
        }}
        onPointerDownOutside={(event) => {
          if (isSaving) event.preventDefault()
        }}
      >
        <div className="theme-dialog__surface">
          <header className="theme-dialog__header">
            <div className="theme-dialog__heading">
              <span className="theme-dialog__heading-icon" aria-hidden="true">
                <Palette size={19} strokeWidth={1.8} />
              </span>
              <div>
                <DialogTitle>选择界面主题</DialogTitle>
                <DialogDescription>切换职业视觉风格，不会影响宏方案和执行状态。</DialogDescription>
              </div>
            </div>
            <Button
              aria-label="关闭主题设置"
              className="theme-dialog__close"
              disabled={isSaving}
              size="icon"
              type="button"
              variant="ghost"
              onClick={cancel}
            >
              <X size={18} strokeWidth={1.8} />
            </Button>
          </header>

          <div className="theme-dialog__fieldset">
            <RadioGroup
              aria-label="选择主题"
              className="theme-dialog__grid"
              disabled={isSaving}
              value={draft.themeId}
              onValueChange={(themeId) => {
                if (isThemeId(themeId)) updateDraft({ themeId })
              }}
            >
              {themes.map((theme) => {
                const selected = draft.themeId === theme.id
                const previewFailed = brokenPreviews.has(theme.id)
                const showPreview = Boolean(theme.preview) && !previewFailed

                return (
                  <div
                    className="theme-card"
                    data-selected={String(selected)}
                    data-theme-id={theme.id}
                    key={theme.id}
                  >
                    <RadioGroupItem
                      aria-label={`${theme.name}主题`}
                      className="theme-card__radio"
                      ref={selected ? selectedThemeRef : undefined}
                      value={theme.id}
                    />
                    <span className="theme-card__body">
                      <span className="theme-card__preview">
                        {showPreview ? (
                          <img
                            alt={`${theme.name}主题预览`}
                            draggable={false}
                            src={theme.preview}
                            onError={() => markPreviewAsBroken(theme.id)}
                          />
                        ) : (
                          <span className="theme-card__fallback" aria-hidden="true">
                            {previewFailed ? (
                              <ImageOff size={25} strokeWidth={1.5} />
                            ) : (
                              <Palette size={25} strokeWidth={1.5} />
                            )}
                          </span>
                        )}
                        <span className="theme-card__selected" aria-hidden="true">
                          <Check size={15} strokeWidth={2.2} />
                        </span>
                      </span>
                      <span className="theme-card__copy">
                        <span className="theme-card__title-row">
                          <strong>{theme.name}</strong>
                          {theme.profession && theme.profession !== theme.name ? (
                            <small>{theme.profession}</small>
                          ) : null}
                        </span>
                        <span>{theme.description}</span>
                      </span>
                    </span>
                  </div>
                )
              })}
            </RadioGroup>
          </div>

          <label className="theme-clean-mode" htmlFor={cleanModeId}>
            <Switch
              checked={draft.cleanMode}
              className="theme-clean-mode__control"
              disabled={isSaving}
              id={cleanModeId}
              onCheckedChange={(cleanMode) => updateDraft({ cleanMode })}
            />
            <span className="theme-clean-mode__copy">
              <strong>纯净模式</strong>
              <span>隐藏角色、纹理和边角装饰，仅保留主题配色。</span>
            </span>
          </label>

          {error ? (
            <Alert className="theme-dialog__error" variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <footer className="theme-dialog__footer">
            <Button
              className="theme-dialog__button theme-dialog__button--secondary"
              disabled={isSaving}
              type="button"
              variant="outline"
              onClick={cancel}
            >
              取消
            </Button>
            <Button
              aria-disabled={isSaving || undefined}
              className="theme-dialog__button theme-dialog__button--primary"
              type="button"
              onClick={() => void apply()}
            >
              {isSaving ? (
                <LoaderCircle
                  aria-hidden="true"
                  className="theme-dialog__spinner"
                  size={16}
                  strokeWidth={2}
                />
              ) : (
                <Check aria-hidden="true" size={16} strokeWidth={2} />
              )}
              {isSaving ? '正在应用' : '应用主题'}
            </Button>
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  )
}
