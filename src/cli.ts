import { Command } from 'commander'
import { HomectlConfig, CommandOptions } from './config/types'
import { loadConfig } from './config/loader'
import { registerHostCommand } from './commands/host'
import { registerServiceCommand } from './commands/service'
import { registerLogsCommand } from './commands/logs'
import { registerDoctorCommand } from './commands/doctor'
import { registerBackupCommand } from './commands/backup'
import { registerConfigCommand } from './commands/config'
import { registerCloudCommand } from './commands/cloud'
import { registerAuthCommand } from './commands/auth'
import { registerInitCommand } from './commands/init'
import { registerContextCommand } from './commands/context'
import { registerStackCommand } from './commands/stack'
import { registerCompletionCommand } from './commands/completion'
import { handleError } from './utils/errors'

const pkg = require('../package.json')

let currentConfig: HomectlConfig

export function createCLI(): Command {
  const program = new Command()

  program
    .name('homectl')
    .description('Operate your homelab and small cloud fleet from one terminal')
    .version(pkg.version || '0.1.0')
    .option('-c, --config <path>', 'Path to config file')
    .option('--context <name>', 'Use named context')
    .hook('preAction', (thisCommand: Command) => {
      const opts = thisCommand.optsWithGlobals() as CommandOptions
      const commandName = thisCommand.name()
      if (commandName === 'init' || commandName === 'completion') return

      try {
        currentConfig = loadConfig(opts.config || process.env.HOMECTL_CONFIG)
        if (opts.context || process.env.HOMECTL_CONTEXT) {
          currentConfig.defaultContext = opts.context || process.env.HOMECTL_CONTEXT
        }
      } catch (err) {
        handleError(err)
      }
    })

  const getConfig = (): HomectlConfig => currentConfig

  registerInitCommand(program)
  registerHostCommand(program, getConfig)
  registerServiceCommand(program, getConfig)
  registerLogsCommand(program, getConfig)
  registerDoctorCommand(program, getConfig)
  registerBackupCommand(program, getConfig)
  registerConfigCommand(program, getConfig)
  registerCloudCommand(program, getConfig)
  registerAuthCommand(program, getConfig)
  registerContextCommand(program, getConfig)
  registerStackCommand(program, getConfig)
  registerCompletionCommand(program)

  program.addHelpText(
    'after',
    `
Environment:
  HOMECTL_CONFIG       Config file path (alternative to --config)
  HOMECTL_CONTEXT      Default context name
  HOMECTL_NO_COLOR     Disable color output

Commands:
  init         Generate starter configuration
  host         Manage and inspect hosts
  service      Manage and inspect services (aliases: svc, s)
  logs         View and tail container logs
  doctor       Run diagnostics on hosts and services
  backup       Back up services and data
  config       Manage and validate configuration
  cloud        Manage cloud VPS and remote infrastructure
  auth         Manage and verify authentication
  context      Manage operation contexts (aliases: ctx, env)
  stack        Manage Docker Compose stacks (aliases: st, compose)
  completion   Generate shell completion scripts

Examples:
  $ homectl init                          # interactive setup
  $ homectl host ls                       # list all hosts
  $ homectl context ls                    # list contexts
  $ homectl context use prod              # switch context
  $ homectl service ls                    # list all services
  $ homectl service restart n8n           # restart a service
  $ homectl service health traefik        # check service health
  $ homectl stack ls                      # list Compose stacks
  $ homectl stack deploy myapp            # deploy a stack
  $ homectl logs tail navidrome --tail 50 # view logs
  $ homectl doctor all                    # full diagnostics
  $ homectl doctor host media-node        # specific host checks
  $ homectl cloud ls                      # list cloud instances
  $ homectl auth check                    # verify SSH auth
  $ homectl config validate               # validate config
  $ homectl backup run postgres           # run backup
  $ homectl backup verify nightly         # verify backup
  $ homectl host ping vps-1               # ping a host
  $ homectl host exec vps-1 'df -h'       # run command on host
  $ homectl completion bash > /etc/bash_completion.d/homectl
`,
  )

  return program
}
