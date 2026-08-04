import { useCallback, useEffect, useState } from 'react'

import type {
  BuffCapturePreview,
  CaptureWindowCandidate,
  NormalizedRect,
  TradeAssistantSettings,
  TradeAssistantState,
  TradeCoordinateSlot,
  TradeMetric,
  TradeTemplateKind
} from '../lib/macro-api'

const defaultState: TradeAssistantState = {
  config: {
    schemaVersion: 2,
    target: null,
    purchaseTemplate: null,
    guardTemplate: null,
    coordinates: { record: null, purchase: null, search: null },
    settings: {
      purchaseCount: 1,
      clickIntervalMs: 50,
      purchaseConfirmFrames: 2,
      purchaseToSearchDelayMs: 100,
      searchToClickDelayMs: 100,
      startDelaySeconds: 3,
      hotkeys: {
        capture: 'CommandOrControl+Alt+Q',
        start: 'CommandOrControl+Alt+P',
        stop: 'CommandOrControl+Alt+O'
      }
    }
  },
  activity: 'stopped',
  isRunning: false,
  countdownRemaining: 0,
  completedPurchases: 0,
  captureSlot: null,
  purchaseConfidence: 0,
  purchasePresent: false,
  guardConfidence: 0,
  guardPresent: false,
  lastError: null
}

export type TradeAssistantController = ReturnType<typeof useTradeAssistantController>

export function useTradeAssistantController() {
  const [state, setState] = useState(defaultState)
  const [windows, setWindows] = useState<CaptureWindowCandidate[]>([])
  const [preview, setPreview] = useState<BuffCapturePreview | null>(null)
  const [metric, setMetric] = useState<TradeMetric>({
    purchaseConfidence: 0,
    purchasePresent: false,
    guardConfidence: 0,
    guardPresent: false
  })
  const [logs, setLogs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const appendLog = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setLogs((current) => [`${time} ${message}`, ...current].slice(0, 150))
  }, [])

  useEffect(() => {
    let disposed = false
    void window.api
      .getTradeAssistantState()
      .then((next) => {
        if (!disposed) setState(next)
      })
      .catch((reason: unknown) => {
        if (!disposed) setError(toMessage(reason))
      })
    const stopState = window.api.onTradeAssistantState(setState)
    const stopMetric = window.api.onTradeMetric(setMetric)
    const stopLog = window.api.onTradeExecutionLog(appendLog)
    return () => {
      disposed = true
      stopState()
      stopMetric()
      stopLog()
    }
  }, [appendLog])

  const run = useCallback(async <T>(operation: () => Promise<T>): Promise<T> => {
    setBusy(true)
    setError(null)
    try {
      return await operation()
    } catch (reason) {
      setError(toMessage(reason))
      throw reason
    } finally {
      setBusy(false)
    }
  }, [])

  const refreshWindows = useCallback(async () => {
    const result = await run(() => window.api.listTradeCaptureWindows())
    setWindows(result)
    return result
  }, [run])

  const capturePreview = useCallback(
    async (windowId: string) => {
      const result = await run(() => window.api.captureTradePreview(windowId))
      setPreview(result)
      return result
    },
    [run]
  )

  const saveTemplate = useCallback(
    async (
      kind: TradeTemplateKind,
      region: NormalizedRect,
      crop: NormalizedRect,
      maskDataUrl?: string
    ) => {
      const result = await run(() => window.api.saveTradeTemplate(kind, region, crop, maskDataUrl))
      setState(result)
      return result
    },
    [run]
  )

  const deleteTemplate = useCallback(
    async (kind: TradeTemplateKind) => {
      const result = await run(() => window.api.deleteTradeTemplate(kind))
      setState(result)
      return result
    },
    [run]
  )

  const updateSettings = useCallback(
    async (settings: TradeAssistantSettings) => {
      const result = await run(() => window.api.updateTradeAssistantSettings(settings))
      setState(result)
      return result
    },
    [run]
  )

  const setCaptureSlot = useCallback(
    async (slot: TradeCoordinateSlot | null) => {
      const result = await run(() => window.api.setTradeCoordinateCapture(slot))
      setState(result)
      return result
    },
    [run]
  )

  const start = useCallback(async () => {
    const result = await run(() => window.api.startTradeAssistant())
    setState(result)
    return result
  }, [run])

  const stop = useCallback(async () => {
    const result = await run(() => window.api.stopTradeAssistant())
    setState(result)
    return result
  }, [run])

  const startTest = useCallback(
    async (windowId: string) => {
      const result = await run(() => window.api.startTradeTemplateTest(windowId))
      setState(result)
      return result
    },
    [run]
  )

  const stopTest = useCallback(async () => {
    const result = await run(() => window.api.stopTradeTemplateTest())
    setState(result)
    return result
  }, [run])

  return {
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
    clearLogs: () => setLogs([])
  }
}

function toMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}
