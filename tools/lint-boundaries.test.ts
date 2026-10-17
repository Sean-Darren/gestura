import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

describe('network import boundaries', () => {
  it('catches network imports and globals in a restricted package', async () => {
    const root = process.cwd()
    const fixture = readFileSync(
      resolve(root, 'tools/lint-fixtures/network-violation.ts.fixture'),
      'utf8'
    )
    const eslint = new ESLint({ cwd: root })
    const results = await eslint.lintText(fixture, {
      filePath: resolve(root, 'packages/pointer/src/network-violation.fixture.ts')
    })
    const ruleIds = results.flatMap((result) => result.messages.map((message) => message.ruleId))

    expect(ruleIds).toContain('no-restricted-imports')
    expect(ruleIds).toContain('no-restricted-globals')
  })
})

it('rejects VS Code execution APIs, aliases, child_process and command bypasses', async () => {
  const eslint = new ESLint({ cwd: process.cwd() })
  const violations = [
    readFileSync(resolve(process.cwd(), 'tools/lint-fixtures/vscode-violation.ts.fixture'), 'utf8'),
    "import { spawn } from 'node:child_process'; spawn('x')",
    "import * as v from 'vscode'; v.window.createTerminal('x')",
    "import * as v from 'vscode'; v.tasks.executeTask(task)",
    "import { debug as d } from 'vscode'; d.startDebugging()",
    "import * as v from 'vscode'; const w = v.window; w['createTerminal']('x')",
    "import * as v from 'vscode'; v.commands.executeCommand('workbench.action.terminal.new')",
    "import * as v from 'vscode'; const {executeCommand} = v.commands",
    "import('node:child_process')",
    "require('child_process')",
    "process.getBuiltinModule('child_process')"
  ]
  for (const code of violations) {
    const results = await eslint.lintText(code, {
      filePath: 'integrations/vscode/src/violation.fixture.ts'
    })
    expect(
      results.flatMap((r) => r.messages).some((m) => m.ruleId === 'gestura/vscode-boundary'),
      code
    ).toBe(true)
  }
  const safe = await eslint.lintText(
    "import * as vscode from 'vscode'; vscode.commands.executeCommand('vscode.diff', left, right); const e = new vscode.WorkspaceEdit()",
    { filePath: 'integrations/vscode/src/safe.fixture.ts' }
  )
  expect(
    safe.flatMap((r) => r.messages).filter((m) => m.ruleId === 'gestura/vscode-boundary')
  ).toEqual([])
})
