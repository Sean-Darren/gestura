import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { join } from 'node:path'
import { createIpcEnvelope, parseIpcEnvelope } from '@gestura/core'

const trustedWebContents = new Set<number>()
let controlWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null

type RendererPage = 'control' | 'overlay' | 'vision'

function rendererUrl(page: RendererPage): { url?: string; filePath?: string } {
  const devServerUrl = process.env.ELECTRON_RENDERER_URL
  if (devServerUrl) return { url: `${devServerUrl.replace(/\/$/, '')}/${page}/index.html` }
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
  window.webContents.on('will-navigate', (event, targetUrl) => {
    const devServerUrl = process.env.ELECTRON_RENDERER_URL
    const allowedDevOrigin = devServerUrl ? new URL(devServerUrl).origin : undefined
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

app.whenReady().then(() => {
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
  trustedWebContents.clear()
  controlWindow = null
  overlayWindow = null
})
