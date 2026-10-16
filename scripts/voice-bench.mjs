import { spawnSync } from 'node:child_process'
const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const result = spawnSync(command, ['exec', 'vitest', 'run', 'tools/voice-bench/src/asr.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, GESTURA_ASR_TEST: '1' },
  shell: process.platform === 'win32'
})
process.exitCode = result.status ?? 1
