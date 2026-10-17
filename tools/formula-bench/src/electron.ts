import { app, net, session } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AppConfigSchema } from '@gestura/core/config'
import { CloudProvider, LocalProvider } from '@gestura/genai'
import { installNetworkPolicy } from '../../../apps/desktop/src/main/network'
import { createBlockedRequestLogger } from '../../../apps/desktop/src/main/network/local-log'
import { runCli } from './cli'
import { routerGenerator } from './generator'
import { allowlistedFetch, providerUrl } from './network'
async function run(): Promise<void> {
  await app.whenReady()
  try {
    await runCli(process.env.GESTURA_BENCH_ROOT!, process.argv.slice(2), async (path) => {
      const config = AppConfigSchema.parse(JSON.parse(await readFile(path, 'utf8')) as unknown)
      if (!config.genai.cloudProvider) throw Error('Cloud provider configuration required')
      const allowlist = config.network.allowlist
      const logger = createBlockedRequestLogger(
        config.logging.enabled,
        join(app.getPath('userData'), 'logs')
      )
      const install = (target: Electron.Session): void =>
        installNetworkPolicy(target, {
          allowlist,
          onBlocked: (request) => {
            void logger.log(request)
          }
        })
      app.on('session-created', install)
      install(session.defaultSession)
      const fetch = allowlistedFetch(net.fetch.bind(net), allowlist)
      const cloud = new CloudProvider({
        ...config.genai.cloudProvider,
        host: providerUrl(config.genai.cloudProvider.host, false),
        fetch
      })
      const local = config.genai.localProvider.enabled
        ? new LocalProvider({
            ...config.genai.localProvider,
            host: providerUrl(config.genai.localProvider.host, true),
            fetch
          })
        : {
            id: 'local',
            generate: async (): Promise<never> => {
              throw Error('Local fallback disabled')
            }
          }
      return routerGenerator({ cloud, local, ...config.genai.formula })
    })
  } catch {
    process.stderr.write(
      'Live benchmark failed; check configuration and allowlist. Provider errors are not logged.\n'
    )
    process.exitCode = 1
  } finally {
    app.exit(Number(process.exitCode ?? 0))
  }
}
// Let Electron finish evaluating this entry before waiting for its ready event.
void run().catch(() => {
  process.stderr.write('Electron benchmark startup failed\n')
  app.exit(1)
})
