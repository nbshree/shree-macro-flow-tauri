import { ScrollText, ShieldAlert, TimerReset, Trash2 } from 'lucide-react'

import { emergencyStopHotkey, type MacroController } from '../../hooks/useMacroController'
import { ThemeLogCharacter } from '../theme'
import { Button } from '../ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

type LogPanelProps = {
  controller: MacroController
}

export function LogPanel({ controller }: LogPanelProps) {
  const {
    logPanelHeight,
    logPanelMaxHeight,
    resizeLogPanelBy,
    startResizeLogPanel,
    state,
    updateState
  } = controller

  return (
    <>
      <div
        aria-label="调整执行日志高度"
        aria-orientation="horizontal"
        aria-valuemax={logPanelMaxHeight}
        aria-valuemin={96}
        aria-valuenow={Math.round(logPanelHeight)}
        aria-valuetext={`${Math.round(logPanelHeight)} 像素`}
        aria-controls="execution-log-panel"
        className="log-resize-handle"
        role="separator"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            resizeLogPanelBy(event.shiftKey ? 48 : 16)
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            resizeLogPanelBy(event.shiftKey ? -48 : -16)
          }
        }}
        onMouseDown={startResizeLogPanel}
      >
        <span />
      </div>
      <div className="log-panel-row" style={{ height: logPanelHeight }}>
        <ThemeLogCharacter />
        <section
          id="execution-log-panel"
          className="ui-panel log-panel"
          aria-labelledby="log-panel-title"
        >
          <header className="log-panel__header">
            <h2 id="log-panel-title">
              <ScrollText aria-hidden="true" size={17} />
              执行日志
            </h2>
            <div className="log-panel__meta">
              <span>
                <TimerReset aria-hidden="true" size={15} />
                倒计时 {state.countdownRemaining}s
              </span>
              <span className="log-panel__emergency">
                <ShieldAlert aria-hidden="true" size={15} />
                {emergencyStopHotkey}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    aria-label="清空执行日志"
                    disabled={state.logs.length === 0}
                    size="icon-compact"
                    type="button"
                    variant="outline"
                    onClick={() => void updateState(window.api.clearLogs())}
                  >
                    <Trash2 aria-hidden="true" size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" sideOffset={6}>
                  清空日志
                </TooltipContent>
              </Tooltip>
            </div>
          </header>
          <div className="log-panel__body" aria-live="polite">
            {state.logs.length === 0 ? (
              <p className="log-panel__empty">暂无日志。</p>
            ) : (
              state.logs.map((item, index) => <p key={`${index}-${item}`}>{item}</p>)
            )}
          </div>
        </section>
      </div>
    </>
  )
}
