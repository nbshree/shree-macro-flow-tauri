import { describe, expect, it } from 'vitest'

import { getInstallBlockedReason } from './install-blocking'

const idleState = {
  macroIsRunning: false,
  macroIsRecording: false,
  gameActivity: 'idle' as const,
  buffActivity: 'stopped' as const,
  buffIsMonitoring: false,
  tradeActivity: 'stopped' as const,
  tradeIsRunning: false,
  gameHasUnsavedChanges: false,
  macroHasUnsavedChanges: false
}

describe('getInstallBlockedReason', () => {
  it('blocks updates during game recording and playback countdowns', () => {
    expect(getInstallBlockedReason({ ...idleState, gameActivity: 'recordingCountdown' })).toBe(
      '游戏操作正在录制，请先停止录制再安装更新。'
    )
    expect(getInstallBlockedReason({ ...idleState, gameActivity: 'playing' })).toBe(
      '游戏操作正在回放，请先停止回放再安装更新。'
    )
  })

  it('blocks updates when any game recorder draft is unsaved', () => {
    expect(getInstallBlockedReason({ ...idleState, gameHasUnsavedChanges: true })).toBe(
      '游戏录制有未保存的配置，请先保存或撤销后再安装更新。'
    )
  })

  it('blocks updates while Buff monitoring is active', () => {
    expect(getInstallBlockedReason({ ...idleState, buffIsMonitoring: true })).toBe(
      'Buff 助手正在捕获游戏画面，请先停止监控或测试再安装更新。'
    )
  })

  it('blocks updates while the trade assistant is running or testing', () => {
    expect(getInstallBlockedReason({ ...idleState, tradeIsRunning: true })).toBe(
      '交易行助手正在截图或执行点击，请先停止抢购或测试再安装更新。'
    )
    expect(getInstallBlockedReason({ ...idleState, tradeActivity: 'testing' })).toBe(
      '交易行助手正在截图或执行点击，请先停止抢购或测试再安装更新。'
    )
  })

  it('allows updates only when every activity and editor is idle', () => {
    expect(getInstallBlockedReason(idleState)).toBeNull()
  })
})
