import {
  Crosshair,
  Eye,
  ImagePlus,
  Play,
  RefreshCw,
  Save,
  Search,
  ShoppingCart,
  Square,
  Trash2
} from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { Button } from '../../components/ui/button'
import type { TradeAssistantController } from '../../hooks/useTradeAssistantController'
import type {
  BuffCapturePreview,
  NormalizedRect,
  TradeAssistantSettings,
  TradeCoordinateSlot,
  TradeTemplateKind
} from '../../lib/macro-api'
import {
  createMaskHistory,
  MaskEditor,
  type MaskEditorHandle,
  type MaskHistory
} from '../buff-assistant/MaskEditor'
import { MaskEditorDialog } from '../buff-assistant/MaskEditorDialog'
import { RegionEditorDialog } from '../buff-assistant/RegionEditorDialog'
import { RegionSelector } from '../buff-assistant/RegionSelector'

import '../buff-assistant/BuffAssistantPage.css'
import './TradeAssistantPage.css'

type Props = { controller: TradeAssistantController }

const defaultPurchaseRegion: NormalizedRect = { x: 0.55, y: 0.55, width: 0.4, height: 0.35 }
const defaultGuardRegion: NormalizedRect = { x: 0.02, y: 0.02, width: 0.3, height: 0.18 }

export function TradeAssistantPage({ controller }: Props) {
  const {
    state,
    windows,
    preview,
    metric,
    logs,
    busy,
    error,
    refreshWindows,
    capturePreview,
    saveTemplate,
    deleteTemplate,
    updateSettings,
    setCaptureSlot,
    start,
    stop,
    startTest,
    stopTest,
    clearLogs
  } = controller
  const [selectedWindowId, setSelectedWindowId] = useState('')
  const [settings, setSettings] = useState<TradeAssistantSettings>(state.config.settings)

  useEffect(() => setSettings(state.config.settings), [state.config.settings])
  useEffect(() => {
    void refreshWindows().catch(() => undefined)
  }, [refreshWindows])
  useEffect(() => {
    if (selectedWindowId || windows.length === 0) return
    const configured = state.config.target
      ? windows.find(
          (candidate) =>
            candidate.processName.toLowerCase() ===
              state.config.target?.processName.toLowerCase() &&
            candidate.windowTitle === state.config.target.windowTitle
        )
      : undefined
    setSelectedWindowId((configured ?? windows[0]).id)
  }, [selectedWindowId, state.config.target, windows])

  const configured = Boolean(
    state.config.target &&
    state.config.purchaseTemplate &&
    state.config.guardTemplate &&
    state.config.coordinates.record &&
    state.config.coordinates.purchase &&
    state.config.coordinates.search
  )
  const status = describeStatus(state.activity, state.countdownRemaining)

  return (
    <div className="trade-assistant-page buff-assistant-page">
      <section className="trade-hero buff-assistant-hero">
        <div>
          <span className="buff-assistant-eyebrow">交易行 · 循环抢购</span>
          <h2>高频点击搜索记录，识别购买图标后自动购买并进入下一轮</h2>
          <p>购买点击成功发送即计数，不代表游戏内实际成交；退出商城或窗口关闭会立即停止。</p>
        </div>
        <div className="buff-assistant-status" data-status={state.activity}>
          <span className="buff-assistant-status__dot" />
          <strong>{status}</strong>
        </div>
      </section>

      {error || state.lastError ? (
        <div className="buff-assistant-error" role="alert">
          {error ?? state.lastError}
        </div>
      ) : null}

      <section className="trade-grid">
        <article className="buff-card trade-runtime-card">
          <header>
            <div>
              <ShoppingCart aria-hidden="true" />
              <div>
                <h3>运行控制</h3>
                <p>首次开始前请在游戏内打开搜索框。</p>
              </div>
            </div>
          </header>
          <div className="trade-runtime-stats">
            <div>
              <span>配置</span>
              <strong>{configured ? '完整' : '未完成'}</strong>
            </div>
            <div>
              <span>购买进度</span>
              <strong>
                {state.completedPurchases} / {state.config.settings.purchaseCount}
              </strong>
            </div>
            <div>
              <span>购买图标</span>
              <strong>
                {Math.round(metric.purchaseConfidence * 100)}% ·{' '}
                {metric.purchasePresent ? '出现' : '未出现'}
              </strong>
            </div>
            <div>
              <span>商城状态</span>
              <strong>
                {Math.round(metric.guardConfidence * 100)}% ·{' '}
                {metric.guardPresent ? '正常' : '未确认'}
              </strong>
            </div>
          </div>
          <div className="buff-card__actions">
            {state.isRunning ? (
              <Button disabled={busy} variant="destructive" onClick={() => void stop()}>
                <Square aria-hidden="true" />
                停止抢购
              </Button>
            ) : (
              <Button
                disabled={busy || !configured || state.activity === 'testing'}
                onClick={() => void start()}
              >
                <Play aria-hidden="true" />
                开始抢购
              </Button>
            )}
            {state.activity === 'testing' ? (
              <Button disabled={busy} variant="outline" onClick={() => void stopTest()}>
                停止识别测试
              </Button>
            ) : (
              <Button
                disabled={
                  busy ||
                  !state.config.purchaseTemplate ||
                  !state.config.guardTemplate ||
                  !selectedWindowId ||
                  state.isRunning
                }
                variant="outline"
                onClick={() => void startTest(selectedWindowId)}
              >
                测试两个图标
              </Button>
            )}
          </div>
        </article>

        <article className="buff-card">
          <header>
            <div>
              <Crosshair aria-hidden="true" />
              <div>
                <h3>三个点击坐标</h3>
                <p>选择槽位后切回游戏，按 {settings.hotkeys.capture} 采集鼠标位置。</p>
              </div>
            </div>
          </header>
          <div className="trade-coordinate-list">
            {coordinateRows.map(([slot, label]) => {
              const point = state.config.coordinates[slot]
              const active = state.captureSlot === slot
              return (
                <button
                  className="trade-coordinate"
                  data-active={active}
                  disabled={busy || state.isRunning}
                  key={slot}
                  type="button"
                  onClick={() => void setCaptureSlot(active ? null : slot)}
                >
                  <span>{label}</span>
                  <strong>{point ? `${point.x}, ${point.y}` : '未采集'}</strong>
                  <small>{active ? '等待采集热键' : '点击选择'}</small>
                </button>
              )
            })}
          </div>
        </article>
      </section>

      <section className="buff-card">
        <header>
          <div>
            <Save aria-hidden="true" />
            <div>
              <h3>次数、时序与热键</h3>
              <p>点位一最低间隔为 20ms，购买和重新搜索之间使用独立延时。</p>
            </div>
          </div>
        </header>
        <div className="trade-settings-grid">
          <NumberField
            label="购买次数"
            min={1}
            max={999}
            value={settings.purchaseCount}
            onChange={(purchaseCount) => setSettings({ ...settings, purchaseCount })}
          />
          <NumberField
            label="点位一间隔（ms）"
            min={20}
            max={1000}
            value={settings.clickIntervalMs}
            onChange={(clickIntervalMs) => setSettings({ ...settings, clickIntervalMs })}
          />
          <NumberField
            label="购买确认帧数"
            min={1}
            max={5}
            value={settings.purchaseConfirmFrames}
            onChange={(purchaseConfirmFrames) =>
              setSettings({ ...settings, purchaseConfirmFrames })
            }
          />
          <NumberField
            label="购买→搜索（ms）"
            min={0}
            max={2000}
            value={settings.purchaseToSearchDelayMs}
            onChange={(purchaseToSearchDelayMs) =>
              setSettings({ ...settings, purchaseToSearchDelayMs })
            }
          />
          <NumberField
            label="搜索→连点（ms）"
            min={0}
            max={2000}
            value={settings.searchToClickDelayMs}
            onChange={(searchToClickDelayMs) => setSettings({ ...settings, searchToClickDelayMs })}
          />
          <NumberField
            label="启动倒计时（秒）"
            min={0}
            max={10}
            value={settings.startDelaySeconds}
            onChange={(startDelaySeconds) => setSettings({ ...settings, startDelaySeconds })}
          />
          {(['capture', 'start', 'stop'] as const).map((key) => (
            <HotkeyField
              key={key}
              label={hotkeyLabels[key]}
              value={settings.hotkeys[key]}
              onChange={(value) =>
                setSettings({ ...settings, hotkeys: { ...settings.hotkeys, [key]: value } })
              }
            />
          ))}
        </div>
        <div className="buff-card__actions">
          <Button
            disabled={busy || state.isRunning || state.activity === 'testing'}
            onClick={() => void updateSettings(settings)}
          >
            <Save aria-hidden="true" />
            保存设置
          </Button>
        </div>
      </section>

      <section className="buff-card buff-template-wizard">
        <header>
          <div>
            <ImagePlus aria-hidden="true" />
            <div>
              <h3>双图标识别配置</h3>
              <p>同一份窗口预览分别配置购买图标和商城状态图标。</p>
            </div>
          </div>
          <Button disabled={busy} size="sm" variant="outline" onClick={() => void refreshWindows()}>
            <RefreshCw aria-hidden="true" />
            刷新窗口
          </Button>
        </header>
        <div className="buff-window-row">
          <select
            aria-label="交易行目标游戏窗口"
            value={selectedWindowId}
            onChange={(event) => setSelectedWindowId(event.target.value)}
          >
            {windows.length === 0 ? <option value="">没有可捕获窗口</option> : null}
            {windows.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.processName} · {candidate.windowTitle} · {candidate.width}×
                {candidate.height}
              </option>
            ))}
          </select>
          <Button
            disabled={busy || !selectedWindowId || state.isRunning}
            variant="outline"
            onClick={() => void capturePreview(selectedWindowId)}
          >
            <Eye aria-hidden="true" />
            捕获预览
          </Button>
        </div>
        <div className="trade-template-grid">
          <TemplateConfigurator
            kind="purchase"
            label="购买图标"
            preview={preview}
            configured={Boolean(state.config.purchaseTemplate)}
            defaultRegion={state.config.purchaseTemplate?.searchRegion ?? defaultPurchaseRegion}
            busy={busy || state.isRunning}
            onSave={saveTemplate}
            onDelete={deleteTemplate}
          />
          <TemplateConfigurator
            kind="guard"
            label="商城状态图标"
            preview={preview}
            configured={Boolean(state.config.guardTemplate)}
            defaultRegion={state.config.guardTemplate?.searchRegion ?? defaultGuardRegion}
            busy={busy || state.isRunning}
            onSave={saveTemplate}
            onDelete={deleteTemplate}
          />
        </div>
      </section>

      <section className="buff-execution-log" aria-labelledby="trade-log-title">
        <header>
          <h3 id="trade-log-title">
            <Search aria-hidden="true" />
            执行日志
          </h3>
          <Button
            aria-label="清空交易行日志"
            disabled={logs.length === 0}
            size="icon-compact"
            variant="outline"
            onClick={clearLogs}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </header>
        <div className="buff-execution-log__body" aria-live="polite">
          {logs.length === 0 ? (
            <p className="buff-execution-log__empty">暂无日志。</p>
          ) : (
            logs.map((item, index) => <p key={`${index}-${item}`}>{item}</p>)
          )}
        </div>
      </section>
    </div>
  )
}

type TemplateProps = {
  kind: TradeTemplateKind
  label: string
  preview: BuffCapturePreview | null
  configured: boolean
  defaultRegion: NormalizedRect
  busy: boolean
  onSave: (
    kind: TradeTemplateKind,
    region: NormalizedRect,
    crop: NormalizedRect,
    mask?: string
  ) => Promise<unknown>
  onDelete: (kind: TradeTemplateKind) => Promise<unknown>
}

function TemplateConfigurator({
  kind,
  label,
  preview,
  configured,
  defaultRegion,
  busy,
  onSave,
  onDelete
}: TemplateProps) {
  const [region, setRegion] = useState<NormalizedRect | null>(defaultRegion)
  const [crop, setCrop] = useState<NormalizedRect | null>(null)
  const [source, setSource] = useState<string | null>(null)
  const [mask, setMask] = useState<MaskHistory>(() => createMaskHistory())
  const [regionOpen, setRegionOpen] = useState(false)
  const [cropOpen, setCropOpen] = useState(false)
  const [maskOpen, setMaskOpen] = useState(false)
  const maskRef = useRef<MaskEditorHandle>(null)

  useEffect(() => {
    let disposed = false
    setCrop(null)
    setMask(createMaskHistory())
    if (!preview || !region) {
      setSource(null)
      return
    }
    void cropImageDataUrl(preview.dataUrl, region).then((result) => {
      if (!disposed) setSource(result)
    })
    return () => {
      disposed = true
    }
  }, [preview, region])

  return (
    <div className="trade-template-card">
      <div className="trade-template-card__heading">
        <strong>{label}</strong>
        <span>{configured ? '已配置' : '未配置'}</span>
      </div>
      {preview ? (
        <RegionSelector
          imageUrl={preview.dataUrl}
          label={`${label}搜索区域`}
          value={region}
          onChange={(next) => setRegion(next)}
          onRequestExpand={() => setRegionOpen(true)}
        />
      ) : (
        <p className="trade-template-placeholder">先捕获窗口预览。</p>
      )}
      {source ? (
        <RegionSelector
          imageUrl={source}
          label={label}
          value={crop}
          onChange={(next) => {
            setCrop(next)
            setMask(createMaskHistory())
          }}
          onRequestExpand={() => setCropOpen(true)}
        />
      ) : null}
      {source && crop ? (
        <MaskEditor
          crop={crop}
          imageUrl={source}
          ref={maskRef}
          value={mask}
          onChange={setMask}
          onRequestExpand={() => setMaskOpen(true)}
        />
      ) : null}
      <div className="buff-card__actions">
        <Button
          disabled={busy || !region || !crop}
          size="sm"
          onClick={() => {
            if (region && crop) void onSave(kind, region, crop, maskRef.current?.getMaskDataUrl())
          }}
        >
          <Save aria-hidden="true" />
          保存{label}
        </Button>
        {configured ? (
          <Button
            disabled={busy}
            size="sm"
            variant="destructive"
            onClick={() => {
              if (window.confirm(`确定删除${label}模板吗？`)) void onDelete(kind)
            }}
          >
            <Trash2 aria-hidden="true" />
            删除
          </Button>
        ) : null}
      </div>
      {preview ? (
        <RegionEditorDialog
          description="框选图标可能出现的最小区域。"
          imageUrl={preview.dataUrl}
          label={`${label}搜索区域`}
          open={regionOpen}
          title={`精调${label}搜索区域`}
          value={region}
          onApply={setRegion}
          onOpenChange={setRegionOpen}
        />
      ) : null}
      {source ? (
        <RegionEditorDialog
          description="紧贴图标主体裁剪模板。"
          imageUrl={source}
          label={label}
          open={cropOpen}
          title={`精调${label}模板`}
          value={crop}
          onApply={(next) => {
            setCrop(next)
            setMask(createMaskHistory())
          }}
          onOpenChange={setCropOpen}
        />
      ) : null}
      {source && crop ? (
        <MaskEditorDialog
          crop={crop}
          imageUrl={source}
          open={maskOpen}
          value={mask}
          onApply={setMask}
          onOpenChange={setMaskOpen}
        />
      ) : null}
    </div>
  )
}

function NumberField({
  label,
  min,
  max,
  value,
  onChange
}: {
  label: string
  min: number
  max: number
  value: number
  onChange: (value: number) => void
}) {
  return (
    <label>
      <span>{label}</span>
      <input
        max={max}
        min={min}
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  )
}

function HotkeyField({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  function capture(event: KeyboardEvent<HTMLInputElement>): void {
    event.preventDefault()
    if (event.key === 'Escape') {
      event.currentTarget.blur()
      return
    }
    const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return
    const parts: string[] = []
    if (event.ctrlKey || event.metaKey) parts.push('CommandOrControl')
    if (event.altKey) parts.push('Alt')
    if (event.shiftKey) parts.push('Shift')
    parts.push(key === 'Escape' ? 'Esc' : key)
    onChange(parts.join('+'))
    event.currentTarget.blur()
  }
  return (
    <label>
      <span>{label}</span>
      <input
        aria-label={label}
        readOnly
        value={value.replace('CommandOrControl', 'Ctrl')}
        onBlur={() => void window.api.setKeyCapture(false)}
        onFocus={() => void window.api.setKeyCapture(true)}
        onKeyDown={capture}
      />
    </label>
  )
}

const coordinateRows: Array<[TradeCoordinateSlot, string]> = [
  ['record', '点位一 · 搜索记录商品'],
  ['purchase', '点位二 · 购买'],
  ['search', '点位三 · 打开搜索框']
]
const hotkeyLabels = { capture: '采集坐标热键', start: '开始抢购热键', stop: '停止抢购热键' }

function describeStatus(activity: string, remaining: number): string {
  if (activity === 'countdown') return `倒计时 ${remaining}s`
  return (
    (
      {
        stopped: '已停止',
        validating: '验证商城',
        clickingRecord: '高频点击中',
        buying: '发送购买',
        reopeningSearch: '重新搜索',
        testing: '识别测试',
        completed: '已完成',
        error: '异常停止'
      } as Record<string, string>
    )[activity] ?? activity
  )
}

function cropImageDataUrl(imageUrl: string, region: NormalizedRect): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const x = Math.floor(image.naturalWidth * region.x)
      const y = Math.floor(image.naturalHeight * region.y)
      const width = Math.max(1, Math.ceil(image.naturalWidth * region.width))
      const height = Math.max(1, Math.ceil(image.naturalHeight * region.height))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) {
        reject(new Error('无法创建交易行模板画布'))
        return
      }
      context.drawImage(image, x, y, width, height, 0, 0, width, height)
      resolve(canvas.toDataURL('image/png'))
    }
    image.onerror = () => reject(new Error('读取交易行预览失败'))
    image.src = imageUrl
  })
}
