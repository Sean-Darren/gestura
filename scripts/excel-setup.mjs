import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// === Ensure Excel is enabled in the app config ===
const configDir = join(homedir(), 'Library', 'Application Support', '@gestura', 'desktop')
const configPath = join(configDir, 'config.json')

let config = {}
if (existsSync(configPath)) {
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'))
  } catch {
    // Corrupt config — start fresh.
  }
}
const prev = config.excel
config.excel = { ...(prev ?? {}), enabled: true }
if (!prev || !prev.enabled) {
  mkdirSync(configDir, { recursive: true })
  writeFileSync(configPath, JSON.stringify(config))
  console.log('✅ Excel bridge enabled in config.')
}

// === Sideload the add-in manifest into Excel's WEF folder ===
const repoRoot = join(import.meta.dirname, '..')
const manifestSrc = join(repoRoot, 'integrations', 'excel-addin', 'manifest.xml')
const wefDir = join(
  homedir(),
  'Library',
  'Containers',
  'com.microsoft.Excel',
  'Data',
  'Documents',
  'wef'
)
const manifestDest = join(wefDir, 'manifest.xml')

let current = ''
try {
  current = existsSync(manifestDest) ? readFileSync(manifestDest, 'utf8') : ''
} catch {
  // Corrupt or missing — overwrite.
}

const next = readFileSync(manifestSrc, 'utf8')
if (current !== next) {
  mkdirSync(wefDir, { recursive: true })
  writeFileSync(manifestDest, next)
  console.log('📋 Excel add-in manifest sideloaded.')
}