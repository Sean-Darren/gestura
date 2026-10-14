import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  session,
  protocol,
  dialog
} from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { readVisionAsset } from './vision/assets'
import { allowVisionCamera } from './vision/permissions'
import { acceptsRendererChannel } from './vision/ipc-policy'
import type { RendererRole } from './vision/ipc-policy'
import { VisionController } from './vision/controller'
import { saveRecording, loadRecording } from './vision/replay-files'
import type { IpcSendPayloadFor, IpcPayloadFor } from '@gestura/core'
import { createIpcEnvelope, parseIpcEnvelope } from '@gestura/core'
import { loadAppConfig } from './config'
import { installNetworkPolicy } from './network'
import { createBlockedRequestLogger } from './network/local-log'
import { pauseAccelerator } from './pause'
import { pause, nativeInput, nativeUi } from './native/runtime'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
])
const trustedWebContents = new Map<number, RendererRole>()
let visionWindow: BrowserWindow | null = null
let visionReady = false
let visionCommand: 'start' | 'stop' = 'stop'
let visionController: VisionController | undefined
let recorderTimer: ReturnType<typeof setInterval> | undefined
let currentVisionStatus: IpcPayloadFor<'vision:status'> = {
  state: 'stopped',
  message: 'Start tracking to measure this camera',
  width: 0,
  height: 0,
  cameraFps: 0
}
let currentVisionMetrics: IpcPayloadFor<'vision:metrics'> = {
  fps: 0,
  inferenceP50Ms: 0,
  inferenceP95Ms: 0,
  faceDetected: false,
  eyeBlinkLeft: 0,
  eyeBlinkRight: 0,
  jawOpen: 0
}
let currentReplayPrompt: IpcPayloadFor<'replay:prompt'> = {
  prompt: '',
  index: 0,
  total: 0,
  remainingMs: 0,
  state: 'idle'
}
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
  trustedWebContents.set(contentsId, page)
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
  visionWindow = createWindow('vision', {
    title: 'Gestura Vision',
    width: 1,
    height: 1,
    show: false,
    skipTaskbar: true,
    webPreferences: { backgroundThrottling: false }
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
      const role = trustedWebContents.get(event.sender.id)
      if (!role || !acceptsRendererChannel(role, envelope.channel)) return
      if (envelope.channel === 'vision:frame') {
        visionController?.receive(envelope.payload)
        return
      }
      if (envelope.channel === 'vision:status') {
        visionController?.receiveStatus(envelope.payload)
        return
      }
      if (envelope.channel === 'vision:control') {
        if (envelope.payload.operation === 'start') visionController?.start()
        else visionController?.stop()
        return
      }
      if (envelope.channel === 'replay:control') {
        try {
          const operation = envelope.payload.operation
          if (operation === 'record') visionController?.record()
          else if (operation === 'stop') void visionController?.saveRecording()
          else if (operation === 'play')
            void visionController?.play().catch((error) => visionController?.fail(error))
          else visionController?.stop()
        } catch (error) {
          visionController?.fail(error)
        }
        return
      }
      if (envelope.channel === 'app:ready') {
        if (role === 'control') {
          event.sender.send('gestura:ipc', createIpcEnvelope('vision:status', currentVisionStatus))
          event.sender.send(
            'gestura:ipc',
            createIpcEnvelope('vision:metrics', currentVisionMetrics)
          )
          event.sender.send('gestura:ipc', createIpcEnvelope('replay:prompt', currentReplayPrompt))
        }
        if (role === 'vision') {
          visionReady = true
          event.sender.send(
            'gestura:ipc',
            createIpcEnvelope('vision:control', { operation: visionCommand })
          )
        }
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
  protocol.handle('app', (request) =>
    readVisionAsset(
      app.isPackaged
        ? join(process.resourcesPath, 'vision')
        : join(app.getAppPath(), 'resources/vision'),
      request.url
    )
  )
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(
      allowVisionCamera(
        contents.id,
        visionWindow?.webContents.id,
        permission,
        'mediaTypes' in details ? details.mediaTypes : undefined
      )
    )
  })
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) =>
    allowVisionCamera(
      contents?.id,
      visionWindow?.webContents.id,
      permission,
      details.mediaType === 'video' ? ['video'] : []
    )
  )
  const sendControl = <Channel extends 'vision:status' | 'vision:metrics' | 'replay:prompt'>(
    channel: Channel,
    payload: IpcSendPayloadFor<Channel>
  ): void => {
    if (controlWindow && !controlWindow.isDestroyed())
      controlWindow.webContents.send('gestura:ipc', createIpcEnvelope(channel, payload))
  }
  visionController = new VisionController({
    pause,
    clock: {
      now: () => performance.timeOrigin + performance.now(),
      schedule: (callback, delay) => {
        const timer = setTimeout(callback, delay)
        return () => clearTimeout(timer)
      }
    },
    camera: (operation) => {
      visionCommand = operation
      if (visionReady && visionWindow && !visionWindow.isDestroyed())
        visionWindow.webContents.send(
          'gestura:ipc',
          createIpcEnvelope('vision:control', { operation })
        )
    },
    status: (value) => {
      currentVisionStatus = value
      sendControl('vision:status', value)
    },
    metrics: (value) => {
      currentVisionMetrics = value
      sendControl('vision:metrics', value)
    },
    prompt: (value) => {
      currentReplayPrompt = value
      sendControl('replay:prompt', value)
    },
    save: async (recording) => {
      const directory = join(app.getPath('userData'), 'fixtures', randomUUID())
      await saveRecording(directory, recording)
      return directory
    },
    open: async () => {
      const selection = await dialog.showOpenDialog({
        title: 'Replay a derived FaceFrame fixture',
        properties: ['openFile'],
        filters: [{ name: 'FaceFrame JSONL', extensions: ['jsonl'] }]
      })
      return selection.canceled || !selection.filePaths[0]
        ? undefined
        : loadRecording(selection.filePaths[0])
    }
  })
  recorderTimer = setInterval(() => visionController?.tick(), 100)
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
  clearInterval(recorderTimer)
  visionController?.dispose()
  nativeInput.dispose()
  nativeUi.dispose()
  globalShortcut.unregisterAll()
  trustedWebContents.clear()
  controlWindow = null
  overlayWindow = null
})
