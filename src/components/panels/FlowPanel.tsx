import { GripVertical, Keyboard, ListChecks, MousePointerClick, Trash2 } from 'lucide-react'

import { formatKeyStep, type MacroController } from '../../hooks/useMacroController'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Switch } from '../ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'

type FlowPanelProps = {
  controller: MacroController
}

export function FlowPanel({ controller }: FlowPanelProps) {
  const {
    captureKeyStep,
    capturePointKey,
    capturingPointKeyId,
    closeKeyStepEditor,
    draftPoints,
    draggingPointId,
    dropPoint,
    isAddingKeyStep,
    isEditingLocked,
    keyDraft,
    keyStepError,
    openKeyStepEditor,
    saveKeyStep,
    savePoint,
    setCapturingPointKeyId,
    setDraggingPointId,
    state,
    updateDraftPoint,
    updatePoint,
    updateState
  } = controller

  return (
    <section className="ui-panel flow-panel" aria-labelledby="flow-panel-title">
      <header className="flow-panel__header">
        <div>
          <h2 id="flow-panel-title">
            <ListChecks aria-hidden="true" size={18} />
            流程步骤
          </h2>
          <p>
            总步骤 {state.points.length} / 启用 {controller.enabledPointCount}，拖拽手柄调整顺序
          </p>
        </div>
        <div className="flow-panel__actions">
          <Button
            disabled={isEditingLocked}
            size="compact"
            type="button"
            variant="outline"
            onClick={openKeyStepEditor}
          >
            <Keyboard aria-hidden="true" size={15} />
            添加按键
          </Button>
          <Button
            disabled={isEditingLocked || state.points.length === 0}
            size="compact"
            type="button"
            variant="outline"
            onClick={() => void updateState(window.api.clearPoints())}
          >
            <Trash2 aria-hidden="true" size={15} />
            清空
          </Button>
        </div>
      </header>

      {isAddingKeyStep ? (
        <div className="key-step-editor">
          <div className="key-step-editor__title">
            <Keyboard aria-hidden="true" size={16} />
            添加键盘按键步骤
          </div>
          <div className="key-step-editor__row">
            <Input
              autoFocus
              readOnly
              aria-label="录制键盘按键"
              aria-invalid={Boolean(keyStepError)}
              data-size="compact"
              data-invalid={String(Boolean(keyStepError))}
              value={keyDraft.key ? formatKeyStep(keyDraft) : '请按组合键，Esc 取消'}
              onKeyDown={captureKeyStep}
            />
            <Button size="compact" type="button" onClick={saveKeyStep}>
              保存
            </Button>
            <Button size="compact" type="button" variant="outline" onClick={closeKeyStepEditor}>
              取消
            </Button>
          </div>
          <p data-invalid={String(Boolean(keyStepError))}>
            {keyStepError || '支持单键和 Ctrl、Alt、Shift 组合键；运行时发送到当前前台窗口。'}
          </p>
        </div>
      ) : null}

      <div className="flow-table-wrap">
        {state.points.length === 0 ? (
          <div className="flow-empty-state">
            <ListChecks aria-hidden="true" size={30} strokeWidth={1.4} />
            <strong>暂无流程步骤</strong>
            <span>按采集热键记录坐标，或添加一个键盘按键步骤。</span>
          </div>
        ) : (
          <div className="flow-table" role="table" aria-label="宏流程步骤">
            <div className="flow-grid flow-table__head" role="row">
              <span role="columnheader">序号</span>
              <span role="columnheader">名称</span>
              <span className="flow-enabled-heading" role="columnheader">
                启用
              </span>
              <span role="columnheader">动作</span>
              <span role="columnheader">参数</span>
              <span role="columnheader">等待 s</span>
              <span role="columnheader">操作</span>
            </div>

            <div role="rowgroup">
              {state.points.map((point, index) => {
                const draft = draftPoints[point.id] ?? point
                const mouseActionLabel = point.action === 'doubleClick' ? '鼠标双击' : '鼠标单击'
                return (
                  <div
                    className="flow-grid flow-table__row"
                    data-active={String(state.currentIndex === index)}
                    data-dragging={String(draggingPointId === point.id)}
                    data-enabled={String(draft.enabled)}
                    key={point.id}
                    role="row"
                    onDragOver={(event) => {
                      if (!isEditingLocked) event.preventDefault()
                    }}
                    onDrop={() => dropPoint(index)}
                  >
                    <div className="flow-order" role="cell">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-label={`拖拽步骤 ${index + 1} 排序`}
                            className="flow-drag-handle cursor-grab active:cursor-grabbing active:translate-y-0 disabled:cursor-not-allowed"
                            disabled={isEditingLocked}
                            draggable={!isEditingLocked}
                            size="icon-compact"
                            type="button"
                            variant="ghost"
                            onDragEnd={() => setDraggingPointId(null)}
                            onDragStart={(event) => {
                              setDraggingPointId(point.id)
                              event.dataTransfer.effectAllowed = 'move'
                            }}
                          >
                            <GripVertical aria-hidden="true" size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={6}>
                          拖拽调整步骤 {index + 1} 顺序
                        </TooltipContent>
                      </Tooltip>
                      <span>{index + 1}</span>
                    </div>

                    <div role="cell">
                      <Input
                        aria-label={`步骤 ${index + 1} 名称`}
                        data-size="compact"
                        disabled={isEditingLocked}
                        value={draft.label}
                        onBlur={() => savePoint(point.id)}
                        onChange={(event) =>
                          updateDraftPoint(point.id, { label: event.target.value })
                        }
                      />
                    </div>

                    <div className="flow-enabled-cell" role="cell">
                      <Switch
                        aria-label={`步骤 ${index + 1} 启用状态`}
                        checked={draft.enabled}
                        disabled={isEditingLocked}
                        onCheckedChange={(enabled) => void updatePoint(point.id, { enabled })}
                      />
                    </div>

                    <div role="cell">
                      {point.action === 'key' ? (
                        <Badge className="action-badge" data-action="key" variant="ghost">
                          键盘按键
                        </Badge>
                      ) : (
                        <Select
                          disabled={isEditingLocked}
                          value={draft.action}
                          onValueChange={(action) => {
                            if (action === 'click' || action === 'doubleClick') {
                              void updatePoint(point.id, { action })
                            }
                          }}
                        >
                          <SelectTrigger
                            aria-label={`步骤 ${index + 1} 鼠标动作`}
                            className="flow-action-select"
                            size="compact"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="click">鼠标单击</SelectItem>
                            <SelectItem value="doubleClick">鼠标双击</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </div>

                    <div role="cell">
                      {point.action === 'key' ? (
                        <Input
                          readOnly
                          aria-label={`步骤 ${index + 1} 键盘按键`}
                          className="font-mono font-semibold"
                          data-capturing={String(capturingPointKeyId === point.id)}
                          data-size="compact"
                          disabled={isEditingLocked}
                          value={
                            capturingPointKeyId === point.id
                              ? '请按组合键...'
                              : formatKeyStep(point)
                          }
                          onBlur={() => {
                            setCapturingPointKeyId(null)
                            void window.api.setKeyCapture(false)
                          }}
                          onFocus={() => {
                            setCapturingPointKeyId(point.id)
                            void window.api.setKeyCapture(true)
                          }}
                          onKeyDown={(event) => capturePointKey(event, point.id)}
                        />
                      ) : (
                        <div className="coordinate-grid">
                          <Input
                            aria-label={`步骤 ${index + 1} X 坐标`}
                            data-size="compact"
                            disabled={isEditingLocked}
                            type="number"
                            value={draft.x}
                            onBlur={() => savePoint(point.id)}
                            onChange={(event) =>
                              updateDraftPoint(point.id, {
                                x: Number(event.target.value) || 0
                              })
                            }
                          />
                          <Input
                            aria-label={`步骤 ${index + 1} Y 坐标`}
                            data-size="compact"
                            disabled={isEditingLocked}
                            type="number"
                            value={draft.y}
                            onBlur={() => savePoint(point.id)}
                            onChange={(event) =>
                              updateDraftPoint(point.id, {
                                y: Number(event.target.value) || 0
                              })
                            }
                          />
                        </div>
                      )}
                    </div>

                    <div role="cell">
                      <Input
                        aria-label={`步骤 ${index + 1} 等待秒数`}
                        data-size="compact"
                        disabled={isEditingLocked}
                        min="0.1"
                        step="0.1"
                        type="number"
                        value={draft.delaySeconds}
                        onBlur={() => savePoint(point.id)}
                        onChange={(event) =>
                          updateDraftPoint(point.id, {
                            delaySeconds: Math.max(0.1, Number(event.target.value) || 0.1)
                          })
                        }
                      />
                    </div>

                    <div className="flow-row-actions" role="cell">
                      {point.action !== 'key' ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              aria-label={`测试步骤 ${index + 1} ${mouseActionLabel}`}
                              disabled={isEditingLocked}
                              size="icon-compact"
                              type="button"
                              variant="outline"
                              onClick={() => void updateState(window.api.testPoint(point.id))}
                            >
                              <MousePointerClick aria-hidden="true" size={14} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="top" sideOffset={6}>
                            测试{mouseActionLabel}
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-label={`删除步骤 ${index + 1}`}
                            disabled={isEditingLocked}
                            size="icon-compact"
                            type="button"
                            variant="outline"
                            onClick={() => void updateState(window.api.removePoint(point.id))}
                          >
                            <Trash2 aria-hidden="true" size={14} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" sideOffset={6}>
                          删除步骤
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
