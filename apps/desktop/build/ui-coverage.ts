import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'
import type { PoorCoverage } from '../../../packages/core/src/snap'
export function parsePoorCoverage(markdown: string): PoorCoverage {
  const result: PoorCoverage = []
  for (const line of markdown.split('\n')) {
    const cells = line
      .trim()
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim().replace(/^`|`$/g, ''))
    const problem = cells[3] ?? ''
    if (!/^poor(?:\s*:|$)/i.test(problem)) continue
    if (cells.length !== 4) throw Error('Poor coverage rows require four cells')
    const osText = cells[0]!.toLowerCase().replace(/\s/g, ''),
      os = ['macos', 'darwin'].includes(osText)
        ? 'darwin'
        : ['windows', 'windows11', 'win32'].includes(osText)
          ? 'win32'
          : undefined
    const appId = cells[1]!,
      reason = problem.replace(/^poor\s*:?\s*/i, '') || 'Coverage marked poor'
    if (
      !os ||
      !appId ||
      appId.length > 512 ||
      reason.length > 500 ||
      [...appId].some((char) => char.charCodeAt(0) < 32) ||
      (os === 'win32'
        ? !/^[^/\\|]+\.exe$/i.test(appId)
        : !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+$/.test(appId))
    )
      throw Error('Poor coverage rows need an OS and exact bundle ID or .exe filename')
    result.push({ os, appId: os === 'win32' ? appId.toLowerCase() : appId, reason })
  }
  if (result.length > 128) throw Error('Too many poor coverage rows')
  return result
}
export function bundledUiCoverage(path: string): Plugin {
  return {
    name: 'gestura-ui-coverage',
    resolveId(id) {
      if (id === 'virtual:gestura-ui-coverage') return '\0gestura-ui-coverage'
    },
    load(id) {
      if (id !== '\0gestura-ui-coverage') return
      this.addWatchFile(path)
      return `export default ${JSON.stringify(parsePoorCoverage(readFileSync(path, 'utf8')))}`
    }
  }
}
