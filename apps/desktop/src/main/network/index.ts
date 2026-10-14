import type { Session } from 'electron'

export type BlockedRequest = { url: string; method: string; sessionId: string }
export type NetworkRequestDetails = {
  url: string
  method: string
  webContentsId?: number
  initiatorOrigin?: string
}
export type NetworkRequestSession = {
  webRequest: {
    onBeforeRequest(
      filter: { urls: string[] },
      listener: (
        details: NetworkRequestDetails,
        callback: (response: { cancel: boolean }) => void
      ) => void
    ): void
  }
}

const sessionIds = new WeakMap<object, string>()
let nextSessionId = 1

function getSessionId(session: object): string {
  const existing = sessionIds.get(session)
  if (existing) return existing
  const id = `session-${nextSessionId++}`
  sessionIds.set(session, id)
  return id
}

export type NetworkPolicyOptions = {
  allowlist: readonly string[]
  localOrigins?: readonly string[]
  onBlocked?: (request: BlockedRequest) => void
}

function normalizedHost(value: string): string | null {
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`)
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
    return url.hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    return null
  }
}

export function isAllowedRequestUrl(
  value: string,
  allowlist: readonly string[],
  localOrigins: readonly string[] = []
): boolean {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }

  if (['file:', 'data:', 'blob:', 'app:'].includes(url.protocol)) return true
  if (localOrigins.some((origin) => origin === url.origin)) return true
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false

  const requestHost = url.hostname.toLowerCase().replace(/\.$/, '')
  return allowlist.some((host) => normalizedHost(host) === requestHost)
}

export function installNetworkPolicy(
  target: NetworkRequestSession | Session,
  options: NetworkPolicyOptions
): void {
  const requestSession = target as NetworkRequestSession
  requestSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const localResource = isAllowedRequestUrl(details.url, [], options.localOrigins)
    const mainProcessAllowlistedRequest =
      details.webContentsId === undefined &&
      details.initiatorOrigin === undefined &&
      isAllowedRequestUrl(details.url, options.allowlist)
    const allowed = localResource || mainProcessAllowlistedRequest
    if (!allowed) {
      options.onBlocked?.({
        url: safeLoggedUrl(details.url),
        method: details.method,
        sessionId: getSessionId(requestSession)
      })
    }
    callback({ cancel: !allowed })
  })
}

function safeLoggedUrl(value: string): string {
  try {
    return new URL(value).origin
  } catch {
    return 'invalid-url'
  }
}
