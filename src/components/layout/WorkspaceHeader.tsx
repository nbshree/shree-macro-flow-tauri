import { Calculator, Castle, Palette, Sparkles, Workflow } from 'lucide-react'
import type { KeyboardEvent, RefObject } from 'react'

import type { MacroController } from '../../hooks/useMacroController'
import { getThemeDefinition, normalizeAppearance } from '../../themes'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'

type WorkspaceHeaderProps = {
  controller: MacroController
  activeWorkspace: WorkspaceView
  themeTriggerRef: RefObject<HTMLButtonElement | null>
  onWorkspaceChange: (workspace: WorkspaceView) => void
  onOpenTheme: () => void
}

export type WorkspaceView = 'macro' | 'calculator' | 'towerCalculator'

const workspaceOrder: readonly WorkspaceView[] = ['macro', 'calculator', 'towerCalculator']
const workspaceTabIds: Record<WorkspaceView, string> = {
  macro: 'workspace-tab-macro',
  calculator: 'workspace-tab-calculator',
  towerCalculator: 'workspace-tab-tower-calculator'
}

const workspaceLabels: Record<WorkspaceView, { title: string; subtitle: string }> = {
  macro: {
    title: '自动点击流程台',
    subtitle: '自动化流程管理'
  },
  calculator: {
    title: '防守内功评估',
    subtitle: '词条、特性与周天收益分析'
  },
  towerCalculator: {
    title: '拆塔内功评估',
    subtitle: '双套抗拆、空拆与周天收益对比'
  }
}

export function WorkspaceHeader({
  controller,
  activeWorkspace,
  themeTriggerRef,
  onWorkspaceChange,
  onOpenTheme
}: WorkspaceHeaderProps) {
  const { state, status } = controller
  const appearance = normalizeAppearance(state.appearance)
  const theme = getThemeDefinition(appearance.themeId)
  const label = workspaceLabels[activeWorkspace]

  function handleWorkspaceKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return

    event.preventDefault()
    const currentIndex = workspaceOrder.indexOf(activeWorkspace)
    const nextWorkspace =
      event.key === 'Home'
        ? workspaceOrder[0]
        : event.key === 'End'
          ? workspaceOrder[workspaceOrder.length - 1]
          : workspaceOrder[
              (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + workspaceOrder.length) %
                workspaceOrder.length
            ]

    onWorkspaceChange(nextWorkspace)
    document.getElementById(workspaceTabIds[nextWorkspace])?.focus()
  }

  return (
    <header className="workspace-header">
      <div className="workspace-brand">
        <div className="workspace-brand__eyebrow">
          <span>Shree Macro Flow</span>
          <span className="workspace-brand__author">作者 小踢踢</span>
        </div>
        <h1>{label.title}</h1>
        <p>{label.subtitle}</p>
      </div>

      <div className="workspace-switcher" role="tablist" aria-label="工作区">
        <Button
          className="workspace-switcher__tab"
          data-active={activeWorkspace === 'macro'}
          id="workspace-tab-macro"
          type="button"
          role="tab"
          variant="ghost"
          aria-controls="macro-workspace"
          aria-selected={activeWorkspace === 'macro'}
          tabIndex={activeWorkspace === 'macro' ? 0 : -1}
          onKeyDown={handleWorkspaceKeyDown}
          onClick={() => onWorkspaceChange('macro')}
        >
          <Workflow aria-hidden="true" />
          <span>宏流程</span>
        </Button>
        <Button
          className="workspace-switcher__tab"
          data-active={activeWorkspace === 'calculator'}
          id="workspace-tab-calculator"
          type="button"
          role="tab"
          variant="ghost"
          aria-controls="calculator-workspace"
          aria-selected={activeWorkspace === 'calculator'}
          tabIndex={activeWorkspace === 'calculator' ? 0 : -1}
          onKeyDown={handleWorkspaceKeyDown}
          onClick={() => onWorkspaceChange('calculator')}
        >
          <Calculator aria-hidden="true" />
          <span>防守内功</span>
        </Button>
        <Button
          className="workspace-switcher__tab"
          data-active={activeWorkspace === 'towerCalculator'}
          id="workspace-tab-tower-calculator"
          type="button"
          role="tab"
          variant="ghost"
          aria-controls="tower-calculator-workspace"
          aria-selected={activeWorkspace === 'towerCalculator'}
          tabIndex={activeWorkspace === 'towerCalculator' ? 0 : -1}
          onKeyDown={handleWorkspaceKeyDown}
          onClick={() => onWorkspaceChange('towerCalculator')}
        >
          <Castle aria-hidden="true" />
          <span>拆塔评估</span>
        </Button>
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
