import { Command } from 'commander'
import { HomectlConfig, CommandOptions } from '../config/types'
import { checkSSHAuth, validateDockerTLSAuth } from '../core/auth'
import { render, detectFormat } from '../renderers'
import { handleError } from '../utils/errors'

export function registerAuthCommand(
  program: Command,
  getConfig: () => HomectlConfig,
): void {
  const auth = program
    .command('auth')
    .description('Manage and verify authentication')

  auth
    .command('check')
    .description('Check SSH authentication for configured hosts')
    .option('--host <host>', 'Check specific host only')
    .option('--json', 'Output as JSON')
    .action(async (options: CommandOptions) => {
      try {
        const config = getConfig()
        const hostsToCheck = options.host
          ? [options.host]
          : config.hosts.map((h) => h.name)

        const results = []
        for (const hostName of hostsToCheck) {
          const hostConfig = config.hosts.find((h) => h.name === hostName)
          if (!hostConfig) {
            results.push({
              host: hostName,
              method: 'none' as const,
              valid: false,
              message: `Host '${hostName}' not found in config`,
            })
            continue
          }

          if (hostConfig.connection.type === 'local') {
            results.push({
              host: hostName,
              method: 'none' as const,
              valid: true,
              message: 'Local connection (no auth needed)',
            })
            continue
          }

          const check = await checkSSHAuth(hostConfig)
          const tlsCheck = validateDockerTLSAuth(hostConfig)
          results.push({
            ...check,
            tls: tlsCheck.message,
          })
        }

        const format = detectFormat(options.json)
        console.log(
          render(format, results, [
            { header: 'Host', key: 'host' },
            { header: 'Method', key: 'method' },
            { header: 'Valid', key: 'valid', format: (v) => v ? 'yes' : 'no' },
            { header: 'Message', key: 'message' },
          ]),
        )
      } catch (err) {
        handleError(err)
      }
    })
}
