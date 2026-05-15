import { Command } from 'commander'
import { HomectlConfig, CommandOptions } from '../config/types'
import { runConfigValidationChecks } from '../core/doctor'
import { render, detectFormat } from '../renderers'
import { handleError } from '../utils/errors'

export function registerConfigCommand(
  program: Command,
  getConfig: () => HomectlConfig,
): void {
  const configCmd = program
    .command('config')
    .description('Manage and validate configuration')

  configCmd
    .command('validate')
    .description('Validate configuration file')
    .option('--json', 'Output as JSON')
    .action(async (options: CommandOptions) => {
      try {
        const config = getConfig()
        const checks = await runConfigValidationChecks(config)
        const failCount = checks.filter((c) => c.status === 'fail').length
        const warnCount = checks.filter((c) => c.status === 'warn').length
        const passCount = checks.filter((c) => c.status === 'pass').length

        const format = detectFormat(options.json)

        if (format === 'json') {
          console.log(render('json', checks))
          return
        }

        console.log(
          render(format, checks as unknown as Record<string, unknown>[], [
            { header: 'Check', key: 'name' },
            {
              header: 'Status',
              key: 'status',
              format: (v) => String(v).toUpperCase(),
            },
            { header: 'Message', key: 'message' },
          ]),
        )
        console.log(
          `\n  ${passCount} valid, ${warnCount} warnings, ${failCount} errors`,
        )

        if (failCount > 0) process.exit(1)
      } catch (err) {
        handleError(err)
      }
    })

  configCmd
    .command('show')
    .description('Show current configuration')
    .option('--json', 'Output as JSON')
    .action((options: CommandOptions) => {
      try {
        const config = getConfig()
        if (options.json) {
          console.log(render('json', config as unknown as Record<string, unknown>))
        } else {
          console.log(render('plain', config as unknown as Record<string, unknown>))
        }
      } catch (err) {
        handleError(err)
      }
    })
}
