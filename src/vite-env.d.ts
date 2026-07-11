/// <reference types="vite/client" />

import type { MacroAPI } from './lib/macro-api'

declare global {
  interface Window {
    api: MacroAPI
  }
}
