import * as vscode from 'vscode'
import { basename, join } from 'node:path'
import { homedir } from 'node:os'
import { lstat, readFile } from 'node:fs/promises'
import { WebSocket } from 'ws'
import { CodePairingSchema, CodeCommandSchema } from '@gestura/core'
import { EditorTransactions } from './transactions'
import type { EditorAdapter, EditorState } from './transactions'

class VscodeEditor implements EditorAdapter, vscode.Disposable {
  private source = vscode.window.activeTextEditor
  private readonly documents = new Map<string, string>()
  private readonly subscription = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor && editor.document.uri.scheme !== 'gestura-preview') this.source = editor
  })
  private readonly provider = vscode.workspace.registerTextDocumentContentProvider(
    'gestura-preview',
    {
      provideTextDocumentContent: (uri) => this.documents.get(uri.toString()) ?? ''
    }
  )
  current(): EditorState | undefined {
    const editor = this.source
    if (
      !vscode.workspace.isTrusted ||
      !vscode.window.state.focused ||
      !editor ||
      editor.document.isClosed ||
      !vscode.window.visibleTextEditors.some(
        (e) => e.document.uri.toString() === editor.document.uri.toString()
      ) ||
      !['file', 'untitled'].includes(editor.document.uri.scheme)
    )
      return undefined
    const doc = editor.document
    return {
      uri: doc.uri.toString(),
      version: doc.version,
      fileName: basename(doc.fileName),
      languageId: doc.languageId,
      text: doc.getText(),
      start: doc.offsetAt(editor.selection.start),
      end: doc.offsetAt(editor.selection.end),
      cursor: doc.offsetAt(editor.selection.active)
    }
  }
  async preview(before: string, after: string, _languageId: string, id: string): Promise<boolean> {
    const left = vscode.Uri.parse(`gestura-preview:/${id}/before`),
      right = vscode.Uri.parse(`gestura-preview:/${id}/proposed`)
    this.documents.clear()
    this.documents.set(left.toString(), before)
    this.documents.set(right.toString(), after)
    await vscode.commands.executeCommand(
      'vscode.diff',
      left,
      right,
      'Gestura · proposed edit (read-only)',
      { preview: true, preserveFocus: true, viewColumn: vscode.ViewColumn.Beside }
    )
    return true
  }
  clear(): void {
    this.documents.clear()
    const tabs = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .filter((tab) => {
        const input = tab.input
        return (
          input instanceof vscode.TabInputTextDiff &&
          input.original.scheme === 'gestura-preview' &&
          input.modified.scheme === 'gestura-preview'
        )
      })
    if (tabs.length) void vscode.window.tabGroups.close(tabs, true).then(undefined, () => {})
  }
  async apply(state: EditorState, start: number, end: number, text: string): Promise<boolean> {
    const doc = this.source?.document
    if (
      !vscode.workspace.isTrusted ||
      !doc ||
      doc.version !== state.version ||
      doc.uri.toString() !== state.uri ||
      doc.getText() !== state.text
    )
      return false
    const edit = new vscode.WorkspaceEdit()
    edit.replace(doc.uri, new vscode.Range(doc.positionAt(start), doc.positionAt(end)), text)
    return vscode.workspace.applyEdit(edit)
  }
  dispose(): void {
    this.clear()
    this.provider.dispose()
    this.subscription.dispose()
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const editor = new VscodeEditor(),
    transactions = new EditorTransactions(editor)
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right)
  status.text = 'Gestura: disconnected'
  status.show()
  let socket: WebSocket | undefined,
    disposed = false
  let reconnect: ReturnType<typeof setTimeout> | undefined
  let attempt = 0
  function retry(): void {
    if (!disposed) {
      clearTimeout(reconnect)
      reconnect = setTimeout(() => void connect(), 3000)
    }
  }
  async function connect(): Promise<void> {
    clearTimeout(reconnect)
    const currentAttempt = ++attempt
    socket?.terminate()
    transactions.disconnect()
    status.text = 'Gestura: pairing…'
    try {
      const directory = join(homedir(), '.gestura-vscode'),
        path = join(directory, 'pairing.json')
      const [dir, file] = await Promise.all([lstat(directory), lstat(path)])
      if (
        dir.isSymbolicLink() ||
        file.isSymbolicLink() ||
        !dir.isDirectory() ||
        !file.isFile() ||
        file.size > 4096
      )
        throw Error('Invalid pairing file')
      // On Windows the native writer creates a protected owner-only DACL before any token is written.
      if (
        process.getuid &&
        (dir.uid !== process.getuid() ||
          file.uid !== process.getuid() ||
          (dir.mode & 0o077) !== 0 ||
          (file.mode & 0o077) !== 0)
      )
        throw Error('Unsafe pairing permissions')
      const pairing = CodePairingSchema.parse(JSON.parse(await readFile(path, 'utf8')))
      if (disposed || currentAttempt !== attempt) return
      const client = new WebSocket(`ws://127.0.0.1:${pairing.port}/vscode`, {
        headers: { Authorization: `Bearer ${pairing.token}` },
        maxPayload: 128 * 1024,
        perMessageDeflate: false,
        followRedirects: false,
        handshakeTimeout: 3000
      })
      socket = client
      client.on('open', () => {
        status.text = 'Gestura: connected'
      })
      client.on('message', (bytes) => {
        if (client !== socket) return
        try {
          const command = CodeCommandSchema.parse(JSON.parse(bytes.toString()))
          void transactions
            .handle(command)
            .then((event) => {
              if (event && client === socket && client.readyState === WebSocket.OPEN)
                client.send(JSON.stringify(event))
            })
            .catch(() => {
              client.close(4000, 'Request rejected')
            })
        } catch {
          client.close(4000, 'Invalid message')
        }
      })
      client.on('close', () => {
        if (client === socket) {
          transactions.disconnect()
          status.text = 'Gestura: disconnected · reconnecting'
          retry()
        }
      })
      client.on('error', () => {
        if (client === socket) {
          transactions.disconnect()
          status.text = 'Gestura: unavailable · start desktop and reconnect'
        }
      })
    } catch {
      status.text = 'Gestura: unavailable · start desktop'
      retry()
    }
  }
  context.subscriptions.push(
    editor,
    status,
    vscode.commands.registerCommand('gestura.connect', connect),
    {
      dispose() {
        disposed = true
        clearTimeout(reconnect)
        socket?.terminate()
        transactions.disconnect()
      }
    }
  )
  void connect()
}
