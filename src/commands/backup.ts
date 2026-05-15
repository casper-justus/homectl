import { Command } from 'commander'
import { HomectlConfig, CommandOptions } from '../config/types'
import { runBackup, listBackups, verifyBackup } from '../core/backup'
import { render, detectFormat } from '../renderers'
import { handleError } from '../utils/errors'

export function registerBackupCommand(
  program: Command,
  getConfig: () => HomectlConfig,
): void {
  const backup = program
    .command('backup')
    .description('Back up services and data')

  backup
    .command('run')
    .description('Run a backup by schedule name')
    .argument('<name>', 'Backup schedule name from config')
    .option('--host <host>', 'Specific host to back up')
    .option('--dry-run', 'Show what would be backed up')
    .option('--json', 'Output as JSON')
    .action(async (name: string, options: CommandOptions) => {
      try {
        const config = getConfig()
        const results = await runBackup(config, name, options.host, options.dryRun)
        const format = detectFormat(options.json)
        console.log(
          render(format, results, [
            { header: 'Name', key: 'name' },
            { header: 'Host', key: 'host' },
            { header: 'Success', key: 'success', format: (v) => v ? 'yes' : 'no' },
            { header: 'Path', key: 'path' },
            { header: 'Size', key: 'size' },
            { header: 'Error', key: 'error' },
          ]),
        )
      } catch (err) {
        handleError(err)
      }
    })

  backup
    .command('ls')
    .description('List existing backups')
    .option('--schedule <name>', 'Filter by schedule name')
    .option('--json', 'Output as JSON')
    .action(async (options: CommandOptions & { schedule?: string }) => {
      try {
        const config = getConfig()
        const results = await listBackups(config, options.schedule)
        const format = detectFormat(options.json)
        if (results.length === 0) {
          console.log('  No backups found.')
          return
        }
        console.log(
          render(format, results, [
            { header: 'Name', key: 'name' },
            { header: 'Host', key: 'host' },
            { header: 'Size', key: 'size' },
            { header: 'Timestamp', key: 'timestamp' },
            { header: 'Path', key: 'path' },
          ]),
        )
      } catch (err) {
        handleError(err)
      }
    })

  backup
    .command('verify')
    .description('Verify the latest backup for a schedule')
    .argument('<name>', 'Backup schedule name')
    .option('--json', 'Output as JSON')
    .action(async (name: string, options: CommandOptions) => {
      try {
        const config = getConfig()
        const result = await verifyBackup(config, name)
        const format = detectFormat(options.json)
        if (format === 'json') {
          console.log(render('json', result))
        } else {
          if (result.success) {
            console.log(`  ✓ Backup '${name}' verified: ${result.path} (${result.size}) [${result.timestamp}]`)
          } else {
            console.log(`  ✗ Backup '${name}' verification failed: ${result.error}`)
            process.exit(1)
          }
        }
      } catch (err) {
        handleError(err)
      }
    })
}
