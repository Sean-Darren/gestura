import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { runCli } from './cli'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const args = process.argv.slice(2)
try {
  if (
    args.some(
      (arg, i) => arg === '--provider=live' || (arg === '--provider' && args[i + 1] === 'live')
    )
  ) {
    const { build } = await import('esbuild')
    const requireDesktop = createRequire(resolve(root, 'apps/desktop/package.json'))
    await build({
      entryPoints: [resolve(root, 'tools/formula-bench/src/electron.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      external: ['electron', 'hyperformula', 'sherpa-onnx-node'],
      splitting: true,
      outdir: resolve(root, 'tools/formula-bench/dist'),
      outExtension: { '.js': '.mjs' },
      plugins: [
        {
          name: 'existing-desktop-asr',
          setup(build) {
            build.onResolve({ filter: /^sherpa-onnx-node$/ }, () => ({
              path: pathToFileURL(requireDesktop.resolve('sherpa-onnx-node')).href,
              external: true
            }))
          }
        }
      ],
      banner: {
        js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);"
      }
    })
    const binary = requireDesktop('electron') as string
    const env: NodeJS.ProcessEnv = { ...process.env, GESTURA_BENCH_ROOT: root }
    delete env.ELECTRON_RUN_AS_NODE
    const child = spawn(binary, [resolve(root, 'tools/formula-bench/dist/electron.mjs'), ...args], {
      stdio: 'inherit',
      env
    })
    const stop = (): void => {
      child.kill('SIGINT')
    }
    process.once('SIGINT', stop)
    await new Promise<void>((done) => {
      child.once('error', () => {
        process.removeListener('SIGINT', stop)
        process.stderr.write('Could not launch Electron benchmark\n')
        process.exitCode = 1
        done()
      })
      child.once('exit', (code) => {
        process.removeListener('SIGINT', stop)
        process.exitCode = code ?? 1
        done()
      })
    })
  } else await runCli(root, args)
} catch {
  process.stderr.write(
    'Formula benchmark failed. Check case/config paths and schemas. Raw provider errors are not logged.\n'
  )
  process.exitCode = 1
}
