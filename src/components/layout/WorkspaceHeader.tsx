import { Palette, Sparkles } from 'lucide-react'
import type { RefObject } from 'react'

import type { MacroController } from '../../hooks/useMacroController'
import { getThemeDefinition, normalizeAppearance } from '../../themes'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'

type WorkspaceHeaderProps = {
  controller: MacroController
  themeTriggerRef: RefObject<HTMLButtonElement | null>
  onOpenTheme: () => void
}

export function WorkspaceHeader({
  controller,
  themeTriggerRef,
  onOpenTheme
}: WorkspaceHeaderProps) {
  const { state, status } = controller
  const appearance = normalizeAppearance(state.appearance)
  const theme = getThemeDefinition(appearance.themeId)

  return (
    <header className="workspace-header">
      <div className="workspace-brand">
        <div className="workspace-brand__eyebrow">
          <span>Shree Macro Flow</span>
          <span className="workspace-brand__author">作者 小踢踢</span>
        </div>
        <h1>自动点击流程台</h1>
        <p>自动化流程管理</p>
      </div>

      <div className="workspace-header__actions">
        <Badge className="status-pill" data-tone={status.tone} variant="ghost" aria-live="polite">
          <span aria-hidden="true" />
          {status.label}
        </Badge>
        <Button
          className="theme-trigger rounded-full"
          ref={themeTriggerRef}
          type="button"
          variant="outline"
          onClick={onOpenTheme}
        >
          {appearance.cleanMode ? (
            <Palette aria-hidden="true" size={17} />
          ) : (
            <Sparkles aria-hidden="true" size={17} />
          )}
          <span>主题：{theme.name}</span>
        </Button>
      </div>
    </header>
  )
}
