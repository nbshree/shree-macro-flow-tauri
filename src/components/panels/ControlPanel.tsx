import { CircleDot, Crosshair, Play, Square } from 'lucide-react'

import { formatHotkey, type MacroController } from '../../hooks/useMacroController'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'

type ControlPanelProps = {
  controller: MacroController
}

export function ControlPanel({ controller }: ControlPanelProps) {
  const { canStopRecording, isEditingLocked, state, targetLoops, updateState } = controller

  return (
    <section className="ui-panel sidebar-panel" aria-labelledby="control-panel-title">
      <div className="ui-panel__heading">
        <h2 id="control-panel-title">
          <Crosshair aria-hidden="true" size={17} />
          控制
        </h2>
        {state.isRecording ? (
          <Badge className="ui-badge--warning" variant="ghost" aria-live="polite">
            采集中
          </Badge>
        ) : null}
      </div>

      <div className="control-overview">
        <div>
          <span>采集热键</span>
          <strong>{formatHotkey(state.settings.hotkeys.capture)}</strong>
        </div>
        <div>
          <span>执行轮次</span>
          <strong>
            {state.completedLoops} / {targetLoops}
          </strong>
        </div>
      </div>

      <div className="control-actions">
        <Button
          disabled={isEditingLocked}
          type="button"
          onClick={() => void updateState(window.api.startRecording())}
        >
          <CircleDot aria-hidden="true" size={15} />
          录制
        </Button>
        <Button
          disabled={!canStopRecording}
          variant="outline"
          type="button"
          onClick={() => void updateState(window.api.stopRecording())}
        >
          <Square aria-hidden="true" size={14} />
          停止录制
        </Button>
        <Button
          disabled={isEditingLocked || state.points.length === 0}
          type="button"
          onClick={() => void updateState(window.api.startRun())}
        >
          <Play aria-hidden="true" size={15} />
          执行
        </Button>
        <Button
          disabled={!state.isRunning}
          variant="outline"
          type="button"
          onClick={() => void updateState(window.api.stopRun())}
        >
          <Square aria-hidden="true" size={14} />
          停止执行
        </Button>
      </div>
    </section>
  )
}
