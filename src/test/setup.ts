import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

class ResizeObserverMock implements ResizeObserver {
  disconnect(): void {}

  observe(): void {}

  unobserve(): void {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  Object.defineProperty(globalThis, 'ResizeObserver', {
    configurable: true,
    value: ResizeObserverMock
  })
}

if (typeof globalThis.PointerEvent === 'undefined') {
  Object.defineProperty(globalThis, 'PointerEvent', {
    configurable: true,
    value: MouseEvent
  })
}

Object.defineProperties(HTMLElement.prototype, {
  scrollIntoView: {
    configurable: true,
    value() {}
  },
  hasPointerCapture: {
    configurable: true,
    value() {
      return false
    }
  },
  setPointerCapture: {
    configurable: true,
    value() {}
  },
  releasePointerCapture: {
    configurable: true,
    value() {}
  }
})

Object.defineProperties(HTMLDialogElement.prototype, {
  showModal: {
    configurable: true,
    value() {
      this.setAttribute('open', '')
    }
  },
  close: {
    configurable: true,
    value() {
      this.removeAttribute('open')
    }
  }
})

afterEach(() => {
  cleanup()
  delete document.documentElement.dataset.theme
  delete document.documentElement.dataset.cleanMode
})
