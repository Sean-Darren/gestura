import type { GesturaApi } from './types'

declare global {
  interface Window {
    gestura: GesturaApi
  }
}

export {}
