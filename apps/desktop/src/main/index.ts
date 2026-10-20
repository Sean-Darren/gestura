import { homedir } from 'node:os'
import { affectsPointerCoordinates } from './display-policy'
import { startCodeServer } from './vscode-bridge/server'
import { CodeBridge } from './vscode-bridge/bridge'
import { publishPairing } from './vscode-bridge/pairing'
import { createPairingToken } from './excel-bridge/token'
import { SnapController } from './snapping/controller'
import { SpeechController } from './speech/controller'
import { InputController } from './input/controller'
import {
  CloudProvider,
  LocalProvider,
  FormulaRouter,
  CodeRouter,
  PlainTextRouter
} from '@gestura/genai'
import { PaletteStore } from './input/store'
import { createNativeUiQueries } from './native/ui-elements'
import { LISTENING_HOTKEY } from '@gestura/core'
import { SpeechTransport } from './speech/transport'
import { allowSpeechMicrophone, isSpeechRendererUrl } from './speech/permissions'
import { SnapStore } from './snapping/store'
import coverageData from 'virtual:gestura-ui-coverage'
import { PoorCoverageSchema } from '@gestura/core'
import { BenchController } from './pointing-bench/controller'
import { BenchStore } from './pointing-bench/store'
import { OverlayController } from './gestures/overlay'
import { CalibrationController } from './calibration/controller'
import { CalibrationStore } from './calibration/store'
import { PointerController } from './pointer/controller'
import {
  app,
  net,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  session,
  shell,
  protocol,
  dialog,
  clipboard
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
import { loadAppConfig, loadOpenRouterEnvironment, withOpenRouter } from './config'
import { allowlistedFetch, providerUrl } from './network/provider-fetch'
import { installNetworkPolicy } from './network'
import { createBlockedRequestLogger } from './network/local-log'
import { pauseAccelerator } from './pause'
import { pause, nativeInput, nativeUi } from './native/runtime'
import { startExcelBridge } from './excel-bridge'
import type { ExcelBridgeHandle } from './excel-bridge'

let benchmarkRequested = process.argv.includes('--pointing-bench')
const primaryInstance = app.requestSingleInstanceLock()
if (!primaryInstance) app.quit()
app.on('second-instance', (_event, args) => {
  if (args.includes('--pointing-bench')) {
    benchmarkRequested = true
    benchController?.show()
  }
  if (controlWindow && !controlWindow.isDestroyed()) {
    if (controlWindow.isMinimized()) controlWindow.restore()
    controlWindow.show()
    controlWindow.focus()
  }
})

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
let snapController: SnapController | undefined
let speechController: SpeechController | undefined
let inputController: InputController | undefined
let codeServer: Awaited<ReturnType<typeof startCodeServer>> | undefined
let codeBridge: CodeBridge | undefined
let removeCodePairing: (() => Promise<void>) | undefined
let excelBridgeHandle: ExcelBridgeHandle | undefined
const inputUi = createNativeUiQueries(pause)
let speechTransport: SpeechTransport | undefined
let benchController: BenchController | undefined
let pointerController: PointerController | undefined
let gestureOverlay: OverlayController | undefined
let calibrationController: CalibrationController | undefined
let calibrationWindowBounds: ReturnType<BrowserWindow['getBounds']> | undefined
let unsubscribePointer: (() => void) | undefined
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
let overlayReady = false
type RendererPage = 'control' | 'overlay' | 'vision' | 'speech'

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

function isSpeechPermissionTarget(
  contents: Electron.WebContents | null,
  requestingUrl: string | undefined,
  captureId: number | undefined
): boolean {
  if (requestingUrl && isSpeechRendererUrl(requestingUrl)) return true
  const contentsUrl = contents?.getURL()
  if (contentsUrl && isSpeechRendererUrl(contentsUrl)) return true
  return contents?.id !== undefined && contents.id === captureId
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
  const window = controlWindow
  let closing = false,
    allowClose = false
  window.on('close', (event) => {
    if (allowClose || !benchController) return
    event.preventDefault()
    if (closing) return
    closing = true
    void benchController.settle().finally(() => {
      allowClose = true
      if (!window.isDestroyed()) window.close()
    })
  })
  controlWindow.on('closed', () => {
    speechController?.setEnabled(false)
    void benchController?.control({ operation: 'cancel' })
    if (calibrationController?.state.active)
      void calibrationController.control({ operation: 'cancel' })
    calibrationWindowBounds = undefined
  })
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
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false
  })
  overlayWindow.setAlwaysOnTop(true)
  overlayWindow.setIgnoreMouseEvents(true, { forward: true })
  overlayWindow.on('hide', () => inputController?.presentationLost())
  overlayWindow.on('closed', () => inputController?.presentationLost())
  overlayWindow.webContents.on('render-process-gone', () => {
    overlayReady = false
    inputController?.presentationLost()
  })
  overlayWindow.webContents.on('did-start-loading', () => {
    overlayReady = false
    if (
      inputController?.state.pending ||
      inputController?.state.busy ||
      !['off', 'error'].includes(speechController?.state.state ?? 'off')
    )
      inputController?.presentationLost()
  })
  overlayWindow.once('ready-to-show', () => overlayWindow?.showInactive())
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

function setListening(enabled: boolean): void {
  if (enabled && (!overlayReady || !overlayWindow?.isVisible())) {
    inputController?.presentationLost()
    return
  }
  speechController?.setEnabled(enabled)
}

function registerIpc(): void {
  ipcMain.on('gestura:ipc', (event, candidate: unknown) => {
    if (!trustedWebContents.has(event.sender.id)) return
    try {
      const envelope = parseIpcEnvelope(candidate)
      const role = trustedWebContents.get(event.sender.id)
      if (!role || !acceptsRendererChannel(role, envelope.channel)) return
      if (envelope.channel === 'palette:control') {
        if (
          envelope.payload.operation !== 'shown' ||
          (role === 'overlay' && overlayWindow?.isVisible())
        )
          void inputController?.control(envelope.payload)
        return
      }
      if (envelope.channel === 'speech:control') {
        setListening(envelope.payload.enabled)
        return
      }
      if (envelope.channel === 'speech:capture') {
        speechController?.capture(envelope.payload)
        return
      }
      if (envelope.channel === 'snap:control') {
        void snapController?.setPreference(envelope.payload)
        return
      }
      if (envelope.channel === 'bench:control') {
        if (envelope.payload.operation !== 'start' || !calibrationController?.state.active)
          void benchController?.control(envelope.payload)
        return
      }
      if (envelope.channel === 'vision:diagnostics') {
        calibrationController?.diagnostics(envelope.payload)
        return
      }
      if (envelope.channel === 'calibration:control') {
        void calibrationController?.control(envelope.payload)
        return
      }
      if (envelope.channel === 'vision:frame') {
        if (pause.paused) {
          gestureOverlay?.pausedFrame(envelope.payload)
          return
        }
        visionController?.receive(envelope.payload)
        return
      }
      if (envelope.channel === 'vision:status') {
        visionController?.receiveStatus(envelope.payload)
        return
      }
      if (envelope.channel === 'gestures:control') {
        if (!calibrationController?.state.active)
          pointerController?.setGestureMode(envelope.payload.mode)
        return
      }
      if (envelope.channel === 'system:toggle-pause') {
        pause.toggle()
        return
      }
      if (envelope.channel === 'pointer:control') {
        if (!calibrationController?.state.active)
          pointerController?.setEnabled(envelope.payload.enabled)
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
        if (role === 'overlay') overlayReady = true
        if (inputController && (role === 'control' || role === 'overlay'))
          event.sender.send(
            'gestura:ipc',
            createIpcEnvelope('palette:state', inputController.state)
          )
        if (role === 'speech') speechTransport?.ready()
        if (speechController && (role === 'control' || role === 'overlay'))
          event.sender.send(
            'gestura:ipc',
            createIpcEnvelope('speech:state', speechController.state)
          )
        if (gestureOverlay && (role === 'control' || role === 'overlay'))
          event.sender.send(
            'gestura:ipc',
            createIpcEnvelope('gestures:state', gestureOverlay.snapshot)
          )
        if (role === 'control') {
          if (snapController)
            event.sender.send(
              'gestura:ipc',
              createIpcEnvelope('snap:settings', snapController.state)
            )
          if (benchController)
            event.sender.send(
              'gestura:ipc',
              createIpcEnvelope('bench:state', benchController.state)
            )
          calibrationController?.firstRun()
          if (calibrationController)
            event.sender.send(
              'gestura:ipc',
              createIpcEnvelope('calibration:state', calibrationController.state)
            )
          if (pointerController)
            event.sender.send(
              'gestura:ipc',
              createIpcEnvelope('pointer:metrics', pointerController.metrics)
            )
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

app.whenReady().then(async () => {
  if (!primaryInstance) return
  // Gestura's own windows (control, overlay) must never be AX hit-tested: the
  // native accessibility worker calls AXUIElementCopyElementAtPosition, and if
  // that query lands on one of our windows macOS calls back into Electron's
  // accessibility handler on the worker thread, crashing V8. Disable Chromium's
  // accessibility tree so our windows stay out of the AX hierarchy.
  app.setAccessibilitySupportEnabled(false)
  const config = withOpenRouter(
    loadAppConfig(join(app.getPath('userData'), 'config.json')),
    loadOpenRouterEnvironment(
      app.isPackaged
        ? undefined
        : (process.env.GESTURA_ENV_PATH ?? join(__dirname, '../../../../.env'))
    )
  )
  const calibrationStore = new CalibrationStore(app.getPath('userData'))
  const calibrationProfile = await calibrationStore.load()
  // Check Accessibility permission early so the user sees a clear prompt.
  if (!nativeInput.hasInputPermission()) {
    console.error(
      '[startup] Accessibility permission NOT granted.',
      'Open System Settings → Privacy & Security → Accessibility and enable Gestura.',
      'Without this, cursor control, clicks, and text input will fail silently.'
    )
    // Prompt macOS to show the permission dialog; no-op if already granted.
    nativeInput.requestInputPermission()
  }
  installNetworkPolicies(config)
  protocol.handle('app', (request) =>
    readVisionAsset(
      app.isPackaged
        ? join(process.resourcesPath, 'vision')
        : join(__dirname, '..', '..', 'resources', 'vision'),
      request.url
    )
  )
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    const speechRequest = isSpeechPermissionTarget(
      contents,
      'requestingUrl' in details ? details.requestingUrl : undefined,
      speechTransport?.captureId
    )
    callback(
      allowSpeechMicrophone(
        contents.id,
        speechTransport?.captureId,
        permission,
        'mediaTypes' in details ? details.mediaTypes : undefined,
        speechController?.state.state === 'starting',
        speechRequest
      ) ||
        allowVisionCamera(
          contents.id,
          visionWindow?.webContents.id,
          permission,
          'mediaTypes' in details ? details.mediaTypes : undefined
        )
    )
  })
  session.defaultSession.setPermissionCheckHandler((contents, permission, _origin, details) => {
    const speechRequest = isSpeechPermissionTarget(
      contents,
      details.requestingUrl,
      speechTransport?.captureId
    )
    return (
      allowSpeechMicrophone(
        contents?.id,
        speechTransport?.captureId,
        permission,
        details.mediaType === 'video' ? ['video'] : ['audio'],
        ['starting', 'listening'].includes(speechController?.state.state ?? ''),
        speechRequest
      ) ||
      allowVisionCamera(
        contents?.id,
        visionWindow?.webContents.id,
        permission,
        details.mediaType === 'video' ? ['video'] : []
      )
    )
  })
  const sendControl = <
    Channel extends
      | 'vision:status'
      | 'vision:metrics'
      | 'replay:prompt'
      | 'pointer:metrics'
      | 'calibration:state'
      | 'snap:settings'
      | 'bench:state'
  >(
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
      if (value.state === 'error') calibrationController?.fail(value.message)
      if (value.width && value.height) {
        if (pointerController) pointerController.aspectRatio = value.width / value.height
        if (calibrationController) calibrationController.aspectRatio = value.width / value.height
      }
      pointerController?.setSource(value.state)
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
  gestureOverlay = new OverlayController({
    config: config.gestures,
    pause,
    now: () => performance.timeOrigin + performance.now(),
    display: () => {
      const d = screen.getPrimaryDisplay()
      return { width: d.bounds.width, height: d.bounds.height, scaleFactor: d.scaleFactor }
    },
    tracking: () => visionCommand === 'start',
    systemPoint: () => screen.getCursorScreenPoint(),
    publish: (state) => {
      for (const window of [controlWindow, overlayWindow])
        if (window && !window.isDestroyed())
          window.webContents.send('gestura:ipc', createIpcEnvelope('gestures:state', state))
    }
  })
  const benchStore = new BenchStore(join(app.getPath('userData'), 'pointing-bench'))
  benchController = new BenchController({
    directory: join(app.getPath('userData'), 'pointing-bench'),
    pause,
    now: () => performance.timeOrigin + performance.now(),
    publish: (state) => sendControl('bench:state', state),
    save: (value) => benchStore.save(value),
    clear: () => benchStore.clear()
  })
  if (benchmarkRequested) benchController.show()
  const snapStore = new SnapStore(app.getPath('userData'))
  snapController = new SnapController({
    ui: nativeUi,
    pause,
    platform: process.platform === 'darwin' ? 'darwin' : 'win32',
    now: () => performance.timeOrigin + performance.now(),
    cacheNow: () => performance.now(),
    preferences: await snapStore.load(),
    poor: PoorCoverageSchema.parse(coverageData),
    config: config.snapping,
    publish: (state) => sendControl('snap:settings', state),
    highlight: (bounds) => gestureOverlay?.setSnap(bounds),
    save: (value) => snapStore.save(value),
    reserved: (point) => {
      const scale = screen.getPrimaryDisplay().scaleFactor
      return (
        (gestureOverlay?.reservedPhysical(point) ?? false) ||
        (inputController?.reserved({ x: point.x / scale, y: point.y / scale }) ?? false)
      )
    }
  })
  pointerController = new PointerController({
    toggleListening: (t) => inputController?.gestureToggleListening(t),
    interceptClick: (point) => {
      const scale = screen.getPrimaryDisplay().scaleFactor
      return inputController?.click({ x: point.x / scale, y: point.y / scale }) ?? false
    },
    externalAction: () => inputController?.invalidateUndo(),
    snapping: snapController,
    bridge: nativeInput,
    pause,
    config: config.pointer,
    gestures: config.gestures,
    latencySample: (time, ms) => benchController?.sample(time, ms),
    feedback: (state) => {
      gestureOverlay?.feedback(state)
      inputController?.headPoint(gestureOverlay?.snapshot.cursor ?? null)
    },
    reserved: (point) => gestureOverlay?.reservedPhysical(point) ?? false,
    profile: config.pointerProfile,
    now: () => performance.timeOrigin + performance.now(),
    publish: (value) => sendControl('pointer:metrics', value)
  })
  if (calibrationProfile) {
    pointerController.applyCalibration(calibrationProfile)
    gestureOverlay.applyProfile(calibrationProfile)
  }
  calibrationController = new CalibrationController({
    profile: calibrationProfile,
    store: calibrationStore,
    pause,
    now: () => performance.timeOrigin + performance.now(),
    logging: calibrationProfile?.loggingEnabled ?? config.logging.enabled,
    display: () => {
      const display = screen.getPrimaryDisplay()
      return {
        width: display.bounds.width,
        height: display.bounds.height,
        scaleFactor: display.scaleFactor
      }
    },
    publish: (state) => {
      if (state.active) gestureOverlay?.calibration(state.cursor)
      sendControl('calibration:state', state)
    },
    apply: (profile) => {
      const enabled = pointerController?.metrics.enabled
      pointerController?.applyCalibration(profile)
      gestureOverlay?.applyProfile(profile)
      if (enabled) pointerController?.setEnabled(true)
    },
    activate: () => pointerController?.setEnabled(true),
    camera: (start) => {
      pointerController?.setEnabled(false)
      if (start) {
        visionController?.stop()
        visionController?.start()
      } else visionController?.stop()
    },
    fullScreen: (active) => {
      const window = controlWindow
      if (!window || window.isDestroyed()) return
      if (active) {
        calibrationWindowBounds ??= window.getBounds()
        window.setBounds(screen.getPrimaryDisplay().bounds)
        window.setFullScreen(true)
      } else {
        const bounds = calibrationWindowBounds
        calibrationWindowBounds = undefined
        window.once('leave-full-screen', () => {
          if (bounds && !window.isDestroyed()) window.setBounds(bounds)
        })
        window.setFullScreen(false)
      }
    }
  })
  unsubscribePointer = visionController.frames.subscribe((frame) => {
    inputController?.consume(
      frame,
      currentVisionStatus.state === 'running' && !calibrationController?.state.active
    )
    calibrationController?.consume(frame)
    pointerController?.consume(frame)
  })
  screen.on('display-added', () => {
    inputController?.displayChanged()
    overlayWindow?.setBounds(screen.getPrimaryDisplay().bounds)
    void benchController?.control({ operation: 'cancel' })
    snapController?.reset()
    pointerController?.invalidateDisplay()
    calibrationController?.displayChanged()
  })
  screen.on('display-removed', () => {
    inputController?.displayChanged()
    overlayWindow?.setBounds(screen.getPrimaryDisplay().bounds)
    void benchController?.control({ operation: 'cancel' })
    snapController?.reset()
    pointerController?.invalidateDisplay()
    calibrationController?.displayChanged()
  })
  screen.on('display-metrics-changed', (_event, _display, changedMetrics) => {
    if (!affectsPointerCoordinates(changedMetrics)) return
    inputController?.displayChanged()
    overlayWindow?.setBounds(screen.getPrimaryDisplay().bounds)
    void benchController?.control({ operation: 'cancel' })
    snapController?.reset()
    pointerController?.invalidateDisplay()
    calibrationController?.displayChanged()
  })
  recorderTimer = setInterval(() => {
    visionController?.tick()
    pointerController?.tick()
    calibrationController?.tick()
    gestureOverlay?.tick()
    snapController?.tick()
    benchController?.tick()
    inputController?.tick(screen.getCursorScreenPoint())
  }, 100)
  registerPauseHotkey()
  registerIpc()
  speechTransport = new SpeechTransport({
    directory: app.isPackaged
      ? join(process.resourcesPath, 'speech')
      : join(__dirname, '..', '..', 'resources', 'speech'),
    config: config.speech,
    createCapture: () =>
      createWindow('speech', {
        title: 'Gestura Microphone Capture',
        show: false,
        width: 1,
        height: 1,
        skipTaskbar: true,
        webPreferences: { backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }
      })
  })
  speechController = new SpeechController({
    pause,
    start: (generation, receive) => speechTransport!.start(generation, receive),
    connect: (generation) => speechTransport!.connect(generation),
    stop: () => speechTransport?.stop(),
    publish: (state) => {
      inputController?.setSpeechState(!['off', 'error'].includes(state.state))
      for (const window of [controlWindow, overlayWindow])
        if (window && !window.isDestroyed())
          window.webContents.send('gestura:ipc', createIpcEnvelope('speech:state', state))
    },
    transcript: (transcript) => {
      void inputController?.transcript(transcript)
      if (controlWindow && !controlWindow.isDestroyed())
        controlWindow.webContents.send(
          'gestura:ipc',
          createIpcEnvelope('speech:transcript', transcript)
        )
    },
    activity: (state) => {
      pointerController?.setSpeechState(state)
      inputController?.setSpeechState(
        !['off', 'error'].includes(speechController?.state.state ?? 'off'),
        state
      )
    }
  })
  const paletteStore = new PaletteStore(app.getPath('userData'))
  if (config.excel.enabled) {
    const excelStaticDir = app.isPackaged
      ? join(process.resourcesPath, 'excel-addin')
      : join(__dirname, '..', '..', '..', '..', 'integrations', 'excel-addin', 'dist')
    const bridgeHandle = await startExcelBridge({
      userDataDir: app.getPath('userData'),
      staticDir: excelStaticDir,
      port: config.excel.port,
      shareSampleValues: config.excel.shareSampleValues
    })
    excelBridgeHandle = bridgeHandle
    if (bridgeHandle.certCreated) {
      dialog
        .showMessageBox({
          type: 'info',
          title: 'Excel bridge certificate',
          message: 'A development certificate was generated so Excel can connect to Gestura.',
          detail: [
            'Double-click the certificate to open Keychain Access.',
            'Find "localhost" in the list, open it, expand Trust, and set "Secure Sockets Layer (SSL)" to Always Trust.',
            'Then restart Excel.'
          ].join('\n\n'),
          buttons: ['Show in Finder', 'Got it'],
          defaultId: 0
        })
        .then(({ response }) => {
          if (response === 0) shell.showItemInFolder(bridgeHandle.certPath)
        })
    }
  }
  const providerFetch = allowlistedFetch(
    (url, init) => net.fetch(url, init),
    config.network.allowlist
  )
  try {
    const token = createPairingToken()
    codeServer = await startCodeServer(token)
    removeCodePairing = await publishPairing(homedir(), { token, port: codeServer.port })
    codeBridge = new CodeBridge(codeServer, pause)
  } catch {
    await codeServer?.close()
    codeServer = undefined
    console.warn(
      'VS Code pairing unavailable. Rebuild the native addon with pnpm native:build, then restart Gestura.'
    )
  }
  const cloudProvider = config.genai.cloudProvider
    ? new CloudProvider({
        host: providerUrl(config.genai.cloudProvider.host, false),
        apiKey: config.genai.cloudProvider.apiKey,
        model: config.genai.cloudProvider.model,
        fetch: providerFetch
      })
    : undefined
  const localProvider =
    config.genai.localProvider.enabled && config.genai.localProvider.model
      ? new LocalProvider({
          host: providerUrl(config.genai.localProvider.host, true),
          model: config.genai.localProvider.model,
          fetch: providerFetch
        })
      : undefined
  const formulaRouter =
    cloudProvider || localProvider
      ? new FormulaRouter({
          ...(cloudProvider ? { cloud: cloudProvider } : {}),
          ...(localProvider ? { local: localProvider } : {}),
          timeoutMs: config.genai.formula.timeoutMs,
          maxRetries: config.genai.formula.maxRetries,
          maxHistory: config.genai.formula.maxHistory
        })
      : undefined
  inputController = new InputController({
    pause,
    bridge: nativeInput,
    settings: await paletteStore.load(config.palette),
    gestures: config.gestures,
    now: () => performance.timeOrigin + performance.now(),
    foreground: () => inputUi.foregroundApp(),
    display: () => screen.getPrimaryDisplay().bounds,
    publish: (state) => {
      for (const window of [controlWindow, overlayWindow])
        if (window && !window.isDestroyed())
          window.webContents.send('gestura:ipc', createIpcEnvelope('palette:state', state))
    },
    listening: setListening,
    gazeOnly: (enabled) => speechController?.setGazeOnly(enabled),
    dragging: (enabled) => pointerController?.setDragging(enabled),
    pointerClick: (kind) => pointerController?.clickAtCursor(kind),
    clipboard: () => clipboard.readText(),
    save: (settings) => paletteStore.save(settings),
    ...(cloudProvider
      ? { plainTextRouter: new PlainTextRouter(cloudProvider, config.genai.formula.timeoutMs) }
      : {}),
    ...(codeBridge && cloudProvider
      ? { codeBridge, codeRouter: new CodeRouter(cloudProvider, config.genai.formula.timeoutMs) }
      : {}),
    ...(excelBridgeHandle ? { excelBridge: excelBridgeHandle.bridge } : {}),
    ...(formulaRouter ? { formulaRouter } : {}),
    formulaAnchor: (target) => {
      const cache = nativeUi.getCachedElements()
      if (!cache || !/excel/i.test(cache.foreground.appId)) return undefined
      const element = cache.elements.find((e) => e.role === 'spreadsheet-cell' && e.name === target)
      if (!element) return undefined
      try {
        const display = nativeInput.getDisplays()?.find((d) => d.primary)
        if (!display) return undefined
        const scale = display.coordinateSpace === 'points' ? 1 : display.scaleFactor
        return {
          x: element.bounds.x / scale,
          y: element.bounds.y / scale,
          width: element.bounds.width / scale,
          height: element.bounds.height / scale
        }
      } catch {
        return undefined
      }
    },
    shareSamples: config.excel.shareSampleValues
  })
  if (!globalShortcut.register(LISTENING_HOTKEY, () => inputController?.toggleListening()))
    dialog.showErrorBox(
      'Listening shortcut unavailable',
      'Ctrl+Alt+L could not be registered. Use the overlay Listen tile or a held mouth gesture. The pause shortcut remains active.'
    )
  createWindows()
  app.on('activate', () => {
    if (!controlWindow || controlWindow.isDestroyed()) createControlWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let benchmarkFlushed = false
let flushingBenchmark = false
app.on('before-quit', (event) => {
  inputController?.dispose()
  speechController?.dispose()
  if (benchController && !benchmarkFlushed) {
    event.preventDefault()
    if (flushingBenchmark) return
    flushingBenchmark = true
    if (!pause.paused) pause.toggle()
    void Promise.all([benchController.settle(), snapController?.settle()]).finally(() => {
      benchmarkFlushed = true
      app.quit()
    })
    return
  }
  clearInterval(recorderTimer)
  unsubscribePointer?.()
  benchController?.dispose()
  snapController?.dispose()
  pointerController?.dispose()
  gestureOverlay?.dispose()
  calibrationController?.dispose()
  visionController?.dispose()
  nativeInput.dispose()
  nativeUi.dispose()
  inputUi.dispose()
  codeBridge?.dispose()
  void codeServer?.close()
  void removeCodePairing?.()
  excelBridgeHandle?.bridge.dispose()
  void excelBridgeHandle?.server.close()
  globalShortcut.unregisterAll()
  trustedWebContents.clear()
  controlWindow = null
  overlayWindow = null
})
