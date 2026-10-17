/** Inject Electron's main-process transport; no Node fetch fallback is permitted. */
export function allowlistedFetch(
  transport: (url: string, init?: RequestInit) => Promise<Response>,
  allowlist: readonly string[]
): typeof globalThis.fetch {
  return (input, init) => {
    const url = new URL(
      typeof input === 'string' || input instanceof URL ? input.toString() : input.url
    )
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      !allowlist.some((h) => h.toLowerCase() === url.host.toLowerCase())
    )
      throw Error('Provider host not allowlisted')
    return transport(url.toString(), { ...init, redirect: 'error' })
  }
}
export function providerUrl(host: string, local: boolean): string {
  const url = new URL(host.includes('://') ? host : `${local ? 'http' : 'https'}://${host}`)
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !['http:', 'https:'].includes(url.protocol)
  )
    throw Error('Invalid provider URL')
  return url.toString().replace(/\/$/, '')
}
