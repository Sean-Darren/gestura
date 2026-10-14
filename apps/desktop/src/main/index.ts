import { app, BrowserWindow, globalShortcut, ipcMain, screen, session } from 'electron'
import { join } from 'node:path'
import { createIpcEnvelope, parseIpcEnvelope } from '@gestura/core'
import { loadAppConfig } from './config'
import { installNetworkPolicy } from './network'
import { createBlockedRequestLogger } from './network/local-log'
import { pauseAccelerator } from './pause'
import { pause, nativeInput } from './native/runtime'

const trustedWebContents = new Set<number>()
let controlWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
type RendererPage = 'control' | 'overlay' | 'vision'

function localRendererOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    const isLoopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname)
    return url.protocol === 'http:' && isLoopback ? url.origin : undefined
  } catch {
    return undefined
  }
}

function rendererUrl(page: RendererPage): { url?: string; filePath?: string } {
  const devOrigin = localRendererOrigin(process.env.ELECTRON_RENDERER_URL)
  if (devOrigin) return { url: `${devOrigin}/${page}/index.html` }
  return { filePath: join(__dirname, '../renderer', page, 'index.html') }
}

function loadRenderer(window: BrowserWindow, page: RendererPage): void {
  const location = rendererUrl(page)
  if (location.url) void window.loadURL(location.url)
  else if (location.filePath) void window.loadFile(location.filePath)
}

function createWindow(
  page: RendererPage,
  options: Electron.BrowserWindowConstructorOptions
): BrowserWindow {
  const window = new BrowserWindow({
    ...options,
    webPreferences: {
      ...options.webPreferences,
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })

  const contentsId = window.webContents.id
  trustedWebContents.add(contentsId)
  window.webContents.once('destroyed', () => trustedWebContents.delete(contentsId))
  window.webContents.once('did-finish-load', () => {
    window.webContents.send(
      'gestura:ipc',
      createIpcEnvelope('system:pause-state', { paused: pause.paused })
    )
  })
  window.webContents.on('will-navigate', (event, targetUrl) => {
    const allowedDevOrigin = localRendererOrigin(process.env.ELECTRON_RENDERER_URL)
    let isAllowedDevNavigation = false
    try {
      isAllowedDevNavigation =
        allowedDevOrigin !== undefined && new URL(targetUrl).origin === allowedDevOrigin
    } catch {
      isAllowedDevNavigation = false
    }
    if (!isAllowedDevNavigation) event.preventDefault()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  loadRenderer(window, page)
  return window
}

const configuredLocalOrigin = localRendererOrigin(process.env.ELECTRON_RENDERER_URL)
const configuredLocalOrigins = configuredLocalOrigin ? [configuredLocalOrigin] : []

function createControlWindow(): BrowserWindow {
  controlWindow = createWindow('control', {
    title: 'Gestura Control',
    width: 900,
    height: 680,
    show: false,
    autoHideMenuBar: true
  })
  controlWindow.once('ready-to-show', () => controlWindow?.show())
  return controlWindow
}

function createOverlayWindow(): BrowserWindow {
  const { x, y, width, height } = screen.getPrimaryDisplay().bounds
  overlayWindow = createWindow('overlay', {
    title: 'Gestura Overlay',
    x,
    y,
    width,
    height,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false
  })
  overlayWindow.setAlwaysOnTop(true)
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  overlayWindow.once('ready-to-show', () => overlayWindow?.show())
  return overlayWindow
}

function createVisionWindow(): void {
  createWindow('vision', {
    title: 'Gestura Vision',
    width: 1,
    height: 1,
    show: false,
    skipTaskbar: true
  })
}

function createWindows(): void {
  createControlWindow()
  createOverlayWindow()
  createVisionWindow()
}

function registerIpc(): void {
  ipcMain.on('gestura:ipc', (event, candidate: unknown) => {
    if (!trustedWebContents.has(event.sender.id)) return
    try {
      const envelope = parseIpcEnvelope(candidate)
      if (envelope.channel === 'app:ready') {
        event.sender.send('gestura:ipc', createIpcEnvelope('app:status', { status: 'ready' }))
      }
    } catch {
      // Ignore malformed renderer messages at the IPC boundary.
    }
  })
}

function installNetworkPolicies(config: ReturnType<typeof loadAppConfig>): void {
  const blockedRequestLogger = createBlockedRequestLogger(
    config.logging.enabled,
    join(app.getPath('userData'), 'logs')
  )
  const installedSessions = new WeakSet<object>()
  const apply = (target: Electron.Session): void => {
    if (installedSessions.has(target)) return
    installedSessions.add(target)
    installNetworkPolicy(target, {
      allowlist: config.network.allowlist,
      localOrigins: configuredLocalOrigins,
      onBlocked: (request) => {
        void blockedRequestLogger.log(request)
      }
    })
  }

  app.on('session-created', apply)
  apply(session.defaultSession)
}

function registerPauseHotkey(): void {
  const accelerator = pauseAccelerator(process.platform)
  if (!globalShortcut.register(accelerator, () => pause.toggle()))
    throw new Error(`Could not register the required global pause hotkey: ${accelerator}`)

  pause.subscribe((paused) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed())
        window.webContents.send('gestura:ipc', createIpcEnvelope('system:pause-state', { paused }))
    }
  })
}

app.whenReady().then(() => {
  const config = loadAppConfig(join(app.getPath('userData'), 'config.json'))
  installNetworkPolicies(config)
  registerPauseHotkey()
  registerIpc()
  createWindows()
  app.on('activate', () => {
    if (!controlWindow || controlWindow.isDestroyed()) createControlWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  nativeInput.dispose()
  globalShortcut.unregisterAll()
  trustedWebContents.clear()
  controlWindow = null
  overlayWindow = null
})
