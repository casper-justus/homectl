import { Command } from 'commander'
import { HomectlConfig, CommandOptions } from '../config/types'
import { tailLogs } from '../core/logs'
import { render, detectFormat } from '../renderers'
import { handleError } from '../utils/errors'

export function registerLogsCommand(
  program: Command,
  getConfig: () => HomectlConfig,
): void {
  const logs = program
    .command('logs')
    .description('View and tail container logs')

  logs
    .command('tail')
    .description('Tail logs for a service')
    .argument('<service>', 'Service name')
    .option('--host <host>', 'Host where service runs')
    .option('--since <since>', 'Show logs since timestamp (e.g. 10m, 1h)')
    .option('--tail <lines>', 'Number of lines to show from end', '50')
    .option('--filter <pattern>', 'Filter logs by keyword')
    .option('--json', 'Output as JSON')
    .action(
      async (
        service: string,
        options: CommandOptions & { tail?: string; since?: string; follow?: boolean; filter?: string },
      ) => {
        try {
          const config = getConfig()
          const entries = await tailLogs(config, service, {
            host: options.host,
            since: options.since,
            tail: options.tail ? parseInt(options.tail, 10) : undefined,
            follow: options.follow,
            filter: options.filter,
          })
          const format = detectFormat(options.json)

          if (format === 'json') {
            console.log(render('json', entries))
          } else {
            for (const entry of entries) {
              console.log(entry.message)
            }
          }
        } catch (err) {
          handleError(err)
        }
      },
    )

  logs
    .command('show')
    .description('Show logs for a service (alias for tail)')
    .argument('<service>', 'Service name')
    .option('--host <host>', 'Host where service runs')
    .option('--since <since>', 'Show logs since timestamp')
    .option('--tail <lines>', 'Number of lines to show', '100')
    .option('--json', 'Output as JSON')
    .action(
      async (
        service: string,
        options: CommandOptions & { tail?: string; since?: string },
      ) => {
        try {
          const config = getConfig()
          const entries = await tailLogs(config, service, {
            host: options.host,
            since: options.since,
            tail: options.tail ? parseInt(options.tail, 10) : undefined,
          })
          const format = detectFormat(options.json)

          if (format === 'json') {
            console.log(render('json', entries))
          } else {
            for (const entry of entries) {
              console.log(entry.message)
            }
          }
        } catch (err) {
          handleError(err)
        }
      },
    )
}
