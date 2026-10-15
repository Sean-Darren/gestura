import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { developmentCsp } from './dev-csp'
const root = fileURLToPath(new URL('../src/renderer/', import.meta.url))
describe('renderer development CSP', () => {
  it('gives every page and React/Vite script a fresh matching nonce without unsafe-inline', async () => {
    const server = await createServer({
      configFile: false,
      root,
      plugins: [react(), developmentCsp()],
      logLevel: 'silent',
      server: { middlewareMode: true, hmr: false, watch: null }
    })
    try {
      const nonces = new Set<string>()
      for (const page of ['control', 'overlay', 'vision', 'control']) {
        const source = await readFile(
          new URL(`../src/renderer/${page}/index.html`, import.meta.url),
          'utf8'
        )
        const html = await server.transformIndexHtml(`/${page}/index.html`, source)
        const nonce = /property="csp-nonce" nonce="([^"]+)"/.exec(html)?.[1]
        expect(nonce).toMatch(/^[A-Za-z0-9+/]{32}$/)
        expect(nonces.has(nonce!)).toBe(false)
        nonces.add(nonce!)
        expect(html).toContain(`script-src 'self' 'nonce-${nonce}'`)
        expect(html).toContain(`style-src 'self' 'nonce-${nonce}'`)
        expect(html).not.toContain('__GESTURA_DEV_CSP_NONCE__')
        expect(html).not.toContain('unsafe-inline')
        for (const script of html.matchAll(/<script\b[^>]*>/g))
          expect(script[0]).toContain(`nonce="${nonce}"`)
        if (page === 'vision') expect(html).toContain("'wasm-unsafe-eval'")
        else expect(html).not.toContain('unsafe-eval')
      }
    } finally {
      await server.close()
    }
  })
  it('is development-only and leaves source production policies strict', async () => {
    expect(developmentCsp().apply).toBe('serve')
    for (const page of ['control', 'overlay', 'vision']) {
      const source = await readFile(
        new URL(`../src/renderer/${page}/index.html`, import.meta.url),
        'utf8'
      )
      expect(source).toContain("style-src 'self';")
      expect(source).not.toContain('nonce-')
      expect(source).not.toContain('unsafe-inline')
    }
  })
})
