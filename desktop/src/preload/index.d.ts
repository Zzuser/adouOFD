import type { AdouApi } from '../shared/types'

declare global {
  interface Window {
    adou: AdouApi
  }
}

export {}
