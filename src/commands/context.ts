import { Command } from 'commander'
import { HomectlConfig, CommandOptions } from '../config/types'
import { listContexts, getContextInfo, setActiveContext } from '../core/context'
import { render, detectFormat } from '../renderers'
import { handleError } from '../utils/errors'
import chalk from 'chalk'

export function registerContextCommand(
  program: Command,
  getConfig: () => HomectlConfig,
): void {
  const context = program
    .command('context')
    .aliases(['ctx', 'env'])
    .description('Manage operation contexts')

  context
    .command('ls')
    .description('List all configured contexts')
    .option('--json', 'Output as JSON')
    .option('--plain', 'Output as plain text')
    .action(async (options: CommandOptions) => {
      try {
        const config = getConfig()
        const contexts = listContexts(config)
        const format = detectFormat(options.json, options.plain)
        console.log(
          render(format, contexts, [
            { header: 'Name', key: 'name' },
            { header: 'Host', key: 'host' },
            { header: 'Tags', key: 'tags', format: (v) => Array.isArray(v) ? v.join(', ') : '' },
            { header: 'Default', key: 'default', format: (v) => v ? chalk.green('●') : '' },
          ]),
        )
        const active = config.defaultContext
        if (active && format !== 'json') {
          console.log(`\n  Active context: ${chalk.cyan(active)}`)
        }
      } catch (err) {
        handleError(err)
      }
    })

  context
    .command('show')
    .description('Show details about a specific context')
    .argument('[name]', 'Context name (default: active context)')
    .option('--json', 'Output as JSON')
    .action(async (name: string | undefined, options: CommandOptions) => {
      try {
        const config = getConfig()
        const target = name || config.defaultContext
        if (!target) {
          console.log('No active context and no name provided.')
          return
        }
        const info = getContextInfo(config, target)
        const format = detectFormat(options.json)

        if (info.error) {
          console.log(`  ${chalk.red('✗')} ${info.error}`)
          return
        }

        if (format === 'json') {
          console.log(render('json', info))
        } else {
          console.log(`  Context: ${chalk.bold(info.context.name)}`)
          console.log(`  Host:    ${info.context.host}`)
          if (info.context.tags?.length) {
            console.log(`  Tags:    ${info.context.tags.join(', ')}`)
          }
          if (target === config.defaultContext) {
            console.log(`  ${chalk.green('●')} Active context`)
          }
        }
      } catch (err) {
        handleError(err)
      }
    })

  context
    .command('use')
    .description('Set the active context')
    .argument('<name>', 'Context name')
    .action(async (name: string) => {
      try {
        const config = getConfig()
        const result = setActiveContext(config, name)
        if (result.success) {
          console.log(`  ${chalk.green('✓')} ${result.message}`)
        } else {
          console.log(`  ${chalk.red('✗')} ${result.message}`)
          process.exit(1)
        }
      } catch (err) {
        handleError(err)
      }
    })
}
