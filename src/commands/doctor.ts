import { Command } from 'commander'
import { HomectlConfig, CommandOptions, DoctorCheck } from '../config/types'
import { runDoctorChecks, runConfigValidationChecks, runFullDiagnostics } from '../core/doctor'
import { render, detectFormat, Column } from '../renderers'
import { handleError } from '../utils/errors'
import chalk from 'chalk'

export function registerDoctorCommand(
  program: Command,
  getConfig: () => HomectlConfig,
): void {
  const doctor = program
    .command('doctor')
    .description('Run diagnostics on hosts and services')

  doctor
    .command('host')
    .description('Run health checks on one or all hosts')
    .argument('[host]', 'Host name to check (default: all)')
    .option('--json', 'Output as JSON')
    .option('--verbose', 'Show detailed output')
    .action(async (host: string | undefined, options: CommandOptions) => {
      try {
        const config = getConfig()
        const checks = await runDoctorChecks(config, host)
        printChecks(checks, options)
      } catch (err) {
        handleError(err)
      }
    })

  doctor
    .command('config')
    .description('Validate configuration')
    .option('--json', 'Output as JSON')
    .action(async (options: CommandOptions) => {
      try {
        const config = getConfig()
        const checks = await runConfigValidationChecks(config)
        printChecks(checks, options)
      } catch (err) {
        handleError(err)
      }
    })

  doctor
    .command('all')
    .description('Run all checks (host health + config validation)')
    .option('--json', 'Output as JSON')
    .action(async (options: CommandOptions) => {
      try {
        const config = getConfig()
        const hostChecks = await runDoctorChecks(config)
        const configChecks = await runConfigValidationChecks(config)
        const allChecks = [...hostChecks, ...configChecks]
        printChecks(allChecks, options)
      } catch (err) {
        handleError(err)
      }
    })

  doctor
    .command('run')
    .description('Run full diagnostics suite')
    .argument('[host]', 'Specific host to check')
    .option('--json', 'Output as JSON')
    .option('--verbose', 'Show detailed output')
    .action(async (host: string | undefined, options: CommandOptions) => {
      try {
        const config = getConfig()
        const checks = await runFullDiagnostics(config, host)
        printChecks(checks, options)
      } catch (err) {
        handleError(err)
      }
    })
}

function printChecks(
  checks: DoctorCheck[],
  options: CommandOptions,
): void {
  const format = detectFormat(options.json)
  const failCount = checks.filter((c) => c.status === 'fail').length
  const warnCount = checks.filter((c) => c.status === 'warn').length
  const passCount = checks.filter((c) => c.status === 'pass').length
  const skipCount = checks.filter((c) => c.status === 'skip').length

  if (format === 'json') {
    console.log(render('json', checks))
    return
  }

  const columns: Column[] = [
    { header: 'Check', key: 'name' },
    {
      header: 'Status', key: 'status',
      format: (v) => {
        switch (v) {
          case 'pass': return chalk.green('PASS')
          case 'warn': return chalk.yellow('WARN')
          case 'fail': return chalk.red('FAIL')
          case 'skip': return chalk.dim('SKIP')
          default: return String(v)
        }
      },
    },
    { header: 'Message', key: 'message' },
  ]

  if (options.verbose) {
    columns.push({ header: 'Detail', key: 'detail' })
  }

  console.log(render('table', checks as unknown as Record<string, unknown>[], columns))
  console.log(
    `\n  ${passCount} passed, ${warnCount} warnings, ${failCount} failed, ${skipCount} skipped`,
  )

  // Print next steps for failures
  const failedWithSteps = checks.filter((c) => c.status === 'fail' && c.nextStep)
  if (failedWithSteps.length > 0) {
    console.log(`\n  ${chalk.bold('Next steps:')}`)
    for (const c of failedWithSteps) {
      console.log(`    ${chalk.cyan('→')} ${c.nextStep}`)
    }
  }

  if (failCount > 0) {
    process.exit(1)
  }
}
