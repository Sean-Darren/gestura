import { describe, expect, it, vi } from 'vitest'
import { installNetworkPolicy, isAllowedRequestUrl } from './index'

describe('network policy', () => {
  it('blocks a renderer request to example.com and records the local attempt', () => {
    let requestListener:
      | ((
          details: {
            url: string
            method: string
            webContentsId?: number
            initiatorOrigin?: string
          },
          callback: (response: { cancel: boolean }) => void
        ) => void)
      | undefined
    const session = {
      webRequest: {
        onBeforeRequest: vi.fn((_filter, listener) => {
          requestListener = listener
        })
      }
    }
    const onBlocked = vi.fn()

    installNetworkPolicy(session, { allowlist: [], onBlocked })
    const callback = vi.fn()
    requestListener?.(
      { url: 'https://example.com/formula', method: 'GET', webContentsId: 42 },
      callback
    )

    expect(callback).toHaveBeenCalledWith({ cancel: true })
    expect(onBlocked).toHaveBeenCalledWith({
      url: 'https://example.com',
      method: 'GET',
      sessionId: 'session-1'
    })
  })

  it('allows local app resources and exact allowlisted hosts', () => {
    expect(isAllowedRequestUrl('file:///app/index.html', [])).toBe(true)
    expect(
      isAllowedRequestUrl('http://127.0.0.1:5173/control', [], ['http://127.0.0.1:5173'])
    ).toBe(true)
    expect(isAllowedRequestUrl('https://api.example.com/v1', ['api.example.com'])).toBe(true)
    expect(isAllowedRequestUrl('https://sub.api.example.com/v1', ['api.example.com'])).toBe(false)
  })

  it('does not let renderer requests use the outbound allowlist', () => {
    let requestListener:
      | ((
          details: {
            url: string
            method: string
            webContentsId?: number
            initiatorOrigin?: string
          },
          callback: (response: { cancel: boolean }) => void
        ) => void)
      | undefined
    const session = {
      webRequest: {
        onBeforeRequest: vi.fn((_filter, listener) => {
          requestListener = listener
        })
      }
    }
    installNetworkPolicy(session, { allowlist: ['api.example.com'] })

    const rendererCallback = vi.fn()
    requestListener?.(
      { url: 'https://api.example.com/v1', method: 'GET', webContentsId: 42 },
      rendererCallback
    )
    const mainCallback = vi.fn()
    requestListener?.({ url: 'https://api.example.com/v1', method: 'GET' }, mainCallback)

    expect(rendererCallback).toHaveBeenCalledWith({ cancel: true })
    expect(mainCallback).toHaveBeenCalledWith({ cancel: false })

    const initiatedCallback = vi.fn()
    requestListener?.(
      { url: 'https://api.example.com/v1', method: 'GET', initiatorOrigin: 'file://' },
      initiatedCallback
    )
    expect(initiatedCallback).toHaveBeenCalledWith({ cancel: true })
  })
})
