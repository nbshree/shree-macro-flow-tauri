import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { TradeAssistantController } from '../../hooks/useTradeAssistantController'
import type { TradeAssistantState } from '../../lib/macro-api'
import { renderWithUiProviders } from '../../test/test-utils'
import { TradeAssistantPage } from './TradeAssistantPage'

const state: TradeAssistantState = {
  config: {
    schemaVersion: 2,
    target: null,
    purchaseTemplate: null,
    guardTemplate: null,
    coordinates: { record: null, purchase: null, search: null },
    settings: {
      purchaseCount: 3,
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

function controller(overrides: Partial<TradeAssistantController> = {}): TradeAssistantController {
  return {
    state,
    windows: [],
    preview: null,
    metric: {
      purchaseConfidence: 0,
      purchasePresent: false,
      guardConfidence: 0,
      guardPresent: false
    },
    logs: [],
    busy: false,
    error: null,
    refreshWindows: vi.fn(async () => []),
    capturePreview: vi.fn(),
    saveTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    updateSettings: vi.fn(),
    setCaptureSlot: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    startTest: vi.fn(),
    stopTest: vi.fn(),
    clearLogs: vi.fn(),
    ...overrides
  } as TradeAssistantController
}

describe('TradeAssistantPage', () => {
  it('shows the loop configuration and blocks starting until configuration is complete', () => {
    renderWithUiProviders(<TradeAssistantPage controller={controller()} />)
    expect(screen.getByRole('button', { name: '开始抢购' })).toBeDisabled()
    expect(screen.getByLabelText('购买次数')).toHaveValue(3)
    expect(screen.getByText('首次开始前请在游戏内打开搜索框。')).toBeInTheDocument()
  })

  it('shows running progress and exposes stop instead of start', () => {
    const running = {
      ...state,
      activity: 'clickingRecord' as const,
      isRunning: true,
      completedPurchases: 1
    }
    renderWithUiProviders(<TradeAssistantPage controller={controller({ state: running })} />)
    expect(screen.getByRole('button', { name: '停止抢购' })).toBeEnabled()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
  })
})
