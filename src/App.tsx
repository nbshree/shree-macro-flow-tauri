import { useRef, useState } from 'react'

import { WindowTitleBar } from './components/layout/WindowTitleBar'
import { WorkspaceHeader, type WorkspaceView } from './components/layout/WorkspaceHeader'
import { ControlPanel } from './components/panels/ControlPanel'
import { FlowPanel } from './components/panels/FlowPanel'
import { LogPanel } from './components/panels/LogPanel'
import { ProfilePanel } from './components/panels/ProfilePanel'
import { SettingsPanel } from './components/panels/SettingsPanel'
import { ThemeBackground, ThemeDialog } from './components/theme'
import { TooltipProvider } from './components/ui/tooltip'
import { InternalSkillCalculatorPage } from './features/internal-skill-calculator'
import { TowerDemolitionCalculatorPage } from './features/tower-demolition-calculator'
import { useMacroController } from './hooks/useMacroController'
import { ThemeProvider } from './themes'

function App(): React.JSX.Element {
  const controller = useMacroController()
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceView>('macro')
  const [themeDialogOpen, setThemeDialogOpen] = useState(false)
  const themeTriggerRef = useRef<HTMLButtonElement>(null)

  return (
    <ThemeProvider appearance={controller.state.appearance}>
      <TooltipProvider delayDuration={300} skipDelayDuration={100}>
        <main className="theme-app-shell app-shell">
          <ThemeBackground
            onAssetError={(asset, source) => console.warn(`主题素材加载失败：${asset}`, source)}
          />
          <div className="theme-content-layer app-frame">
            <WindowTitleBar />
            <div className="workspace">
              <WorkspaceHeader
                controller={controller}
                activeWorkspace={activeWorkspace}
                themeTriggerRef={themeTriggerRef}
                onWorkspaceChange={setActiveWorkspace}
                onOpenTheme={() => setThemeDialogOpen(true)}
              />
              <section
                className="workspace-view"
                id="macro-workspace"
                role="tabpanel"
                aria-labelledby="workspace-tab-macro"
                hidden={activeWorkspace !== 'macro'}
              >
                <section className="workspace-grid">
                  <aside className="sidebar" aria-label="宏控制与配置">
                    <ControlPanel controller={controller} />
                    <ProfilePanel controller={controller} />
                    <SettingsPanel controller={controller} />
                  </aside>
                  <section className="main-workspace" aria-label="宏流程与执行日志">
                    <FlowPanel controller={controller} />
                    <LogPanel controller={controller} />
                  </section>
                </section>
              </section>
              <section
                className="workspace-view"
                id="calculator-workspace"
                role="tabpanel"
                aria-labelledby="workspace-tab-calculator"
                hidden={activeWorkspace !== 'calculator'}
              >
                <InternalSkillCalculatorPage active={activeWorkspace === 'calculator'} />
              </section>
              <section
                className="workspace-view"
                id="tower-calculator-workspace"
                role="tabpanel"
                aria-labelledby="workspace-tab-tower-calculator"
                hidden={activeWorkspace !== 'towerCalculator'}
              >
                <TowerDemolitionCalculatorPage />
              </section>
            </div>
          </div>

          <ThemeDialog
            appearance={controller.state.appearance}
            open={themeDialogOpen}
            returnFocusRef={themeTriggerRef}
            onApply={(appearance) => controller.updateAppearance(appearance)}
            onOpenChange={setThemeDialogOpen}
          />
        </main>
      </TooltipProvider>
    </ThemeProvider>
  )
}

export default App
