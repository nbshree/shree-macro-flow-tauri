import { CircleAlert, Save, Settings } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { formatHotkey, type MacroController } from '@/hooks/useMacroController'
import type { MacroSettings } from '@/lib/macro-api'

const hotkeyFields: Array<[keyof MacroSettings['hotkeys'], string]> = [
  ['capture', '采集坐标'],
  ['start', '开始执行'],
  ['stop', '停止执行']
]

type SettingsPanelProps = {
  controller: MacroController
}

export function SettingsPanel({ controller }: SettingsPanelProps) {
  const {
    captureHotkey,
    capturingHotkey,
    draftSettings,
    isEditingLocked,
    setDraftSettings,
    startHotkeyCapture,
    state,
    stopHotkeyCapture,
    syncDefaultDelayToPoints,
    updateDraftNumber,
    updateState
  } = controller

  function updateLoopMode(value: string): void {
    if (value !== 'count' && value !== 'infinite') return
    setDraftSettings((current) => ({ ...current, loopMode: value }))
  }

  return (
    <section className="ui-panel sidebar-panel" aria-labelledby="settings-panel-title">
      <div className="ui-panel__heading">
        <h2 id="settings-panel-title">
          <Settings aria-hidden="true" size={17} />
          配置
        </h2>
      </div>

      <div className="settings-grid">
        <div className="ui-field ui-field--wide">
          <Label htmlFor="default-click-interval">默认点击间隔 s</Label>
          <div className="settings-sync-row">
            <Input
              id="default-click-interval"
              disabled={isEditingLocked}
              min="0.1"
              step="0.1"
              type="number"
              value={draftSettings.clickIntervalSeconds}
              onChange={(event) => updateDraftNumber('clickIntervalSeconds', event.target.value)}
            />
            <Button
              disabled={isEditingLocked || state.points.length === 0}
              type="button"
              variant="outline"
              onClick={() => void syncDefaultDelayToPoints()}
            >
              同步
            </Button>
          </div>
        </div>

        <div className="ui-field">
          <Label htmlFor="loop-interval">循环间隔 s</Label>
          <Input
            id="loop-interval"
            disabled={isEditingLocked}
            min="0"
            step="0.1"
            type="number"
            value={draftSettings.loopIntervalSeconds}
            onChange={(event) => updateDraftNumber('loopIntervalSeconds', event.target.value)}
          />
        </div>

        <div className="ui-field">
          <Label htmlFor="start-delay">倒计时 s</Label>
          <Input
            id="start-delay"
            disabled={isEditingLocked}
            min="0"
            step="1"
            type="number"
            value={draftSettings.startDelaySeconds}
            onChange={(event) => updateDraftNumber('startDelaySeconds', event.target.value)}
          />
        </div>

        <div className="ui-field">
          <Label id="loop-mode-label">循环模式</Label>
          <RadioGroup
            aria-labelledby="loop-mode-label"
            className="grid h-[35px] grid-cols-2 gap-1 rounded-md border border-input bg-[var(--surface-input)] p-[3px] shadow-xs"
            disabled={isEditingLocked}
            value={draftSettings.loopMode}
            onValueChange={updateLoopMode}
          >
            <div className="relative min-w-0">
              <RadioGroupItem className="peer sr-only" id="loop-mode-count" value="count" />
              <Label
                className="h-full cursor-pointer justify-center rounded-[4px] px-1 text-center text-[11px] whitespace-nowrap text-muted-foreground transition-[background-color,color,box-shadow] duration-[var(--motion-fast)] peer-data-[state=checked]:bg-ui-primary peer-data-[state=checked]:text-ui-primary-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/30 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                htmlFor="loop-mode-count"
              >
                指定次数
              </Label>
            </div>
            <div className="relative min-w-0">
              <RadioGroupItem className="peer sr-only" id="loop-mode-infinite" value="infinite" />
              <Label
                className="h-full cursor-pointer justify-center rounded-[4px] px-1 text-center text-[11px] whitespace-nowrap text-muted-foreground transition-[background-color,color,box-shadow] duration-[var(--motion-fast)] peer-data-[state=checked]:bg-ui-primary peer-data-[state=checked]:text-ui-primary-foreground peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/30 peer-disabled:cursor-not-allowed peer-disabled:opacity-50"
                htmlFor="loop-mode-infinite"
              >
                无限循环
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="ui-field">
          <Label htmlFor="loop-count">循环次数</Label>
          <Input
            id="loop-count"
            disabled={isEditingLocked || draftSettings.loopMode === 'infinite'}
            min="1"
            step="1"
            type="number"
            value={draftSettings.loopCount}
            onChange={(event) => updateDraftNumber('loopCount', event.target.value)}
          />
        </div>
      </div>

      <div className="hotkey-grid">
        {hotkeyFields.map(([key, label]) => {
          const inputId = `hotkey-${key}`
          const isCapturing = capturingHotkey === key

          return (
            <div className="ui-field" key={key}>
              <Label htmlFor={inputId}>{label}</Label>
              <Input
                readOnly
                aria-label={`${label}快捷键`}
                data-capturing={String(isCapturing)}
                disabled={isEditingLocked}
                id={inputId}
                value={isCapturing ? '请按组合键...' : formatHotkey(draftSettings.hotkeys[key])}
                onBlur={stopHotkeyCapture}
                onFocus={() => startHotkeyCapture(key)}
                onKeyDown={(event) => captureHotkey(event, key)}
              />
            </div>
          )
        })}
      </div>

      {state.hotkeyErrors.length > 0 ? (
        <Alert className="mt-[9px]" variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>
            {state.hotkeyErrors.map((item) => (
              <p key={item}>{item}</p>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}

      <Button
        className="mt-[9px] w-full"
        disabled={isEditingLocked}
        type="button"
        onClick={() => void updateState(window.api.updateSettings(draftSettings))}
      >
        <Save aria-hidden="true" size={16} />
        保存配置
      </Button>
    </section>
  )
}
