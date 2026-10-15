import { randomBytes } from 'node:crypto'
import type { Plugin } from 'vite'
const marker = '__GESTURA_DEV_CSP_NONCE__'
/** Vite inserts nonce attributes last, so replace its placeholder after the full HTML transform. */
export function developmentCsp(): Plugin {
  return {
    name: 'gestura-development-csp',
    apply: 'serve',
    config: () => ({ html: { cspNonce: marker } }),
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!html.includes("script-src 'self'") || !html.includes("style-src 'self'"))
          throw new Error('Renderer HTML must declare strict script/style CSP directives')
        return html
          .replace("script-src 'self'", `script-src 'self' 'nonce-${marker}'`)
          .replace("style-src 'self'", `style-src 'self' 'nonce-${marker}'`)
      }
    },
    configureServer(server) {
      const transform = server.transformIndexHtml.bind(server)
      server.transformIndexHtml = async (...args) => {
        const html = await transform(...args)
        return html.replaceAll(marker, randomBytes(24).toString('base64'))
      }
    }
  }
}
