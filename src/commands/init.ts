import { Command } from 'commander'
import * as fs from 'fs'
import * as path from 'path'
import * as yaml from 'js-yaml'
import { execLocal } from '../adapters/shell'
import { handleError } from '../utils/errors'
import {
  clearScreen,
  printBanner,
  prompt,
  confirm,
  select,
  multiselect,
  printStep,
  printSuccess,
  printInfo,
  printWarning,
  pressEnter,
  closeRL,
  initInputQueue,
} from '../utils/prompts'

const TOTAL_STEPS = 8

interface WizardHost {
  name: string
  connection: { type: string; host: string; port?: number; user?: string; identityFile?: string }
  runtime: { docker: boolean; compose: boolean }
  paths?: { composeRoot?: string }
  tags: string[]
}

interface WizardContext {
  name: string
  host: string
  tags?: string[]
}

interface WizardState {
  outputPath: string
  hosts: WizardHost[]
  contexts: WizardContext[]
  defaultContext: string
  backup: { baseDir: string; schedules: Record<string, any> }
  tailscale: { enabled: boolean; ip?: string; authKey?: string }
  sshKeyPath: string
}

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Interactive setup wizard for homectl configuration')
    .option('--output <path>', 'Output path for config file', './homectl.yaml')
    .option('--force', 'Overwrite existing config')
    .action(async (options: { output: string; force: boolean }) => {
      try {
        const outputPath = path.resolve(options.output)

        if (fs.existsSync(outputPath) && !options.force) {
          const overwrite = await confirm(
            `Config already exists at ${outputPath}. Overwrite?`,
            false,
          )
          if (!overwrite) {
            console.log('\n  Setup cancelled.')
            return
          }
        }

        await runWizard(outputPath)
      } catch (err) {
        handleError(err)
      }
    })
}

async function runWizard(outputPath: string): Promise<void> {
  clearScreen()
  printBanner()
  await initInputQueue()
  await pressEnter()

  const state: WizardState = {
    outputPath,
    hosts: [],
    contexts: [],
    defaultContext: 'lab',
    backup: { baseDir: '~/homectl-backups', schedules: {} },
    tailscale: { enabled: false },
    sshKeyPath: '',
  }

  await stepLocalHost(state)
  await stepSSH(state)
  await stepVPS(state)
  await stepDockerConfig(state)
  await stepTailscale(state)
  await stepBackup(state)
  await stepContexts(state)
  await stepReview(state)
}

async function stepLocalHost(state: WizardState): Promise<void> {
  printStep(1, TOTAL_STEPS, 'Local host setup')

  printInfo('Detecting Docker on this machine...')
  let dockerFound = false
  let composeFound = false

  try {
    const result = await execLocal('docker', ['--version'], { timeout: 5000 })
    dockerFound = result.code === 0
  } catch {
    // Docker not available
  }

  if (dockerFound) {
    printSuccess('Docker detected')
    try {
      const compose = await execLocal('docker', ['compose', 'version'], { timeout: 5000 })
      composeFound = compose.code === 0
    } catch {
      // no compose
    }
    if (composeFound) printSuccess('Docker Compose detected')
  } else {
    printWarning('Docker not detected on this machine')
  }

  const runtime = dockerFound
    ? (composeFound
        ? await select('Local host runtime type:', ['compose', 'docker'], 0)
        : 'docker')
    : 'docker'

  state.hosts.push({
    name: 'local',
    connection: { type: 'local', host: 'localhost' },
    runtime: { docker: true, compose: runtime === 'compose' },
    tags: ['local', 'dev'],
  })
  printSuccess(`Local host configured (runtime: ${runtime})`)
}

async function stepSSH(state: WizardState): Promise<void> {
  printStep(2, TOTAL_STEPS, 'SSH key setup')

  const setupSSH = await confirm('Set up SSH keys for remote hosts?', true)
  if (!setupSSH) {
    printInfo('Skipping SSH setup. You can configure keys later in homectl.yaml')
    return
  }

  const defaultKeyPath =
    process.platform === 'win32'
      ? path.join(process.env.USERPROFILE || '~', '.ssh', 'id_ed25519')
      : path.join(process.env.HOME || '~', '.ssh', 'id_ed25519')

  const existingKeys: string[] = []
  const sshDir =
    process.platform === 'win32'
      ? path.join(process.env.USERPROFILE || '~', '.ssh')
      : path.join(process.env.HOME || '~', '.ssh')

  if (fs.existsSync(sshDir)) {
    const files = fs.readdirSync(sshDir)
    for (const f of files) {
      if (
        (f.includes('id_') || f.includes('homectl') || f.includes('homelab')) &&
        !f.endsWith('.pub')
      ) {
        existingKeys.push(path.join(sshDir, f))
      }
    }
  }

  let keyPath = ''

  if (existingKeys.length > 0) {
    printInfo(`Found ${existingKeys.length} existing SSH key(s)`)
    const useExisting = await confirm('Use an existing SSH key?', true)
    if (useExisting) {
      existingKeys.push('(specify a different key)')
      const selected = await select('Select SSH key:', existingKeys, 0)
      if (selected !== '(specify a different key)') {
        keyPath = selected
      }
    }
  }

  if (!keyPath) {
    const generateKey = await confirm(
      `Generate a new ed25519 key at ${defaultKeyPath}?`,
      !existingKeys.length,
    )
    if (generateKey) {
      keyPath = defaultKeyPath
      printInfo(`Generating SSH key: ${keyPath}...`)
      try {
        const dir = path.dirname(keyPath)
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true })
        }
        await execLocal('ssh-keygen', ['-t', 'ed25519', '-f', keyPath, '-N', '', '-q'], { timeout: 10000 })
        printSuccess(`SSH key generated: ${keyPath}`)
      } catch (err) {
        printWarning(`Could not auto-generate key: ${err instanceof Error ? err.message : String(err)}`)
        keyPath = await prompt('Enter path to existing SSH key:', defaultKeyPath)
      }
    } else {
      keyPath = await prompt('Enter path to existing SSH key:', defaultKeyPath)
    }
  }

  state.sshKeyPath = keyPath

  const pubPath = keyPath + '.pub'
  if (fs.existsSync(pubPath)) {
    const pubKey = fs.readFileSync(pubPath, 'utf-8').trim()
    printInfo(`Public key:\n  ${pubKey}`)
    await pressEnter()
  }

  printSuccess('SSH key configured')
}

async function stepVPS(state: WizardState): Promise<void> {
  printStep(3, TOTAL_STEPS, 'Cloud / VPS hosts')

  const addVPS = await confirm('Add a remote VPS or cloud host?', true)
  if (!addVPS) {
    printInfo('Skipping VPS setup')
    return
  }

  let addMore = true
  let vpsCount = 0

  while (addMore) {
    vpsCount++
    const name = await prompt(`Host name (e.g. vps-${vpsCount}, prod-server):`, `vps-${vpsCount}`)
    const hostname = await prompt('IP address or hostname:', '')
    if (!hostname) {
      printWarning('No hostname provided, skipping this host')
      addMore = await confirm('Add another host?', false)
      continue
    }

    const sshUser = await prompt('SSH user:', 'root')
    const sshPortStr = await prompt('SSH port:', '22')
    const sshPort = parseInt(sshPortStr, 10) || 22

    const keyPath =
      state.sshKeyPath ||
      (await prompt('SSH identity file path:', '~/.ssh/id_ed25519'))

    const provider = await select('Cloud provider:', ['generic-ssh', 'hetzner', 'digitalocean', 'lightsail'], 0)

    const runtime = await select('Runtime type:', ['docker', 'compose'], 0)

    const tags = await multiselect(
      'Tags (select all that apply):',
      ['cloud', 'prod', 'staging', 'lan', 'media', 'db', 'edge', 'backup'],
      ['cloud', 'prod'],
    )

    state.hosts.push({
      name,
      connection: {
        type: 'ssh',
        host: hostname,
        port: sshPort,
        user: sshUser,
        identityFile: keyPath,
      },
      runtime: { docker: true, compose: runtime === 'compose' },
      tags: [...new Set([provider, ...tags])],
    })

    printSuccess(`Host '${name}' added (${hostname})`)
    addMore = await confirm('Add another host?', vpsCount < 2)
  }
}

async function stepDockerConfig(state: WizardState): Promise<void> {
  printStep(4, TOTAL_STEPS, 'Docker configuration')

  const composeHosts = state.hosts.filter((h) => h.runtime.compose)

  if (composeHosts.length === 0) {
    printInfo('No Compose hosts to configure')
    return
  }

  for (const host of composeHosts) {
    const configurePaths = await confirm(
      `Configure Docker Compose paths for '${host.name}'?`,
      false,
    )
    if (configurePaths) {
      const workDir = await prompt('Working directory for Compose files:', '/home/*/docker')
      if (!host.paths) host.paths = {}
      host.paths.composeRoot = workDir
      printSuccess(`Compose paths configured for '${host.name}'`)
    }
  }

  printInfo('\nDocker daemon access:')
  printInfo('  homectl uses SSH for remote Docker by default (secure)')
  printInfo('  Avoid exposing Docker daemon over plain TCP')
}

async function stepTailscale(state: WizardState): Promise<void> {
  printStep(5, TOTAL_STEPS, 'Tailscale setup (optional)')

  const useTailscale = await confirm('Enable Tailscale integration?', false)
  if (!useTailscale) {
    printInfo('Skipping Tailscale setup')
    return
  }

  let tailscaleIP = ''
  try {
    const result = await execLocal('tailscale', ['ip', '-4'], { timeout: 5000 })
    if (result.code === 0 && result.stdout.trim()) {
      tailscaleIP = result.stdout.trim()
      printSuccess(`Tailscale detected: ${tailscaleIP}`)
    }
  } catch {
    // not running
  }

  if (!tailscaleIP) {
    tailscaleIP = await prompt('Enter your Tailscale IP (e.g. 100.x.x.x):', '')
  }

  state.tailscale = { enabled: true, ip: tailscaleIP }

  for (const host of state.hosts) {
    if (host.connection.type === 'ssh') {
      const isTS = await confirm(
        `Is '${host.name}' reachable via Tailscale?`,
        false,
      )
      if (isTS) {
        const tsIP = await prompt(`Tailscale IP for '${host.name}':`, host.connection.host)
        if (tsIP) {
          host.connection.host = tsIP
          host.tags = [...(host.tags || []), 'tailscale']
        }
      }
    }
  }

  printSuccess('Tailscale configured')
}

async function stepBackup(state: WizardState): Promise<void> {
  printStep(6, TOTAL_STEPS, 'Backup configuration')

  const configureBackup = await confirm('Set up basic backup schedules?', true)
  if (!configureBackup) {
    printInfo('Skipping backup setup')
    return
  }

  const baseDir = await prompt('Backup storage directory:', state.backup.baseDir)
  state.backup.baseDir = baseDir

  const addConfigBackup = await confirm('Back up Docker Compose configs?', true)
  if (addConfigBackup) {
    const configHosts = state.hosts.map((h) => h.name)
    const selectedHosts = await multiselect(
      'Which hosts to back up configs from:',
      configHosts,
      configHosts.filter((h) => h !== 'local'),
    )
    state.backup.schedules.configs = {
      hosts: selectedHosts,
      paths: ['./docker-compose.yml', './.env'],
      retentionDays: 30,
    }
    printSuccess('Config backup schedule added')
  }

  const addDataBackup = await confirm('Back up Docker volumes?', false)
  if (addDataBackup) {
    const dataHosts = state.hosts.map((h) => h.name)
    const selectedHosts = await multiselect(
      'Which hosts to back up volumes from:',
      dataHosts,
      dataHosts.filter((h) => h !== 'local'),
    )
    state.backup.schedules.volumes = {
      hosts: selectedHosts,
      paths: ['/var/lib/docker/volumes'],
      retentionDays: 14,
    }
    printSuccess('Volume backup schedule added')
  }
}

async function stepContexts(state: WizardState): Promise<void> {
  printStep(7, TOTAL_STEPS, 'Environment contexts')

  const setupContexts = await confirm('Set up environment contexts (e.g. lab, prod, staging)?', true)
  if (!setupContexts) {
    printInfo('Using default context: lab')
    return
  }

  const contextName = await prompt('Default context name:', 'lab')
  state.defaultContext = contextName

  state.contexts.push({
    name: contextName,
    host: state.hosts[0]?.name || 'local',
  })

  const addProd = await confirm('Add a production context?', true)
  if (addProd) {
    const prodName = await prompt('Production context name:', 'prod')
    const prodHosts = state.hosts.filter(
      (h) => h.tags?.includes('cloud') || h.tags?.includes('prod'),
    )
    state.contexts.push({
      name: prodName,
      host: prodHosts[0]?.name || 'vps-1',
    })
    printSuccess(`Context '${prodName}' added`)
  }

  printSuccess(`Contexts configured (default: ${state.defaultContext})`)
}

async function stepReview(state: WizardState): Promise<void> {
  printStep(8, TOTAL_STEPS, 'Review & generate')

  const config = buildConfig(state)
  const yamlContent = yaml.dump(config, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    noCompatMode: true,
  })

  console.log('\n  ' + '─'.repeat(44))
  console.log('  Generated configuration preview:')
  console.log('  ' + '─'.repeat(44))
  console.log()
  console.log(`  Hosts:        ${state.hosts.length} configured`)
  for (const h of state.hosts) {
    console.log(`    ${h.name}: ${h.connection.host} (${h.connection.type})`)
  }
  console.log(`  Contexts:     ${state.contexts.length}`)
  console.log(`  SSH keys:     ${state.sshKeyPath || 'not configured'}`)
  console.log(`  Tailscale:    ${state.tailscale.enabled ? 'enabled' : 'disabled'}`)
  const scheduleCount = Object.keys(state.backup.schedules).length
  console.log(`  Backups:      ${scheduleCount} schedule(s)`)
  console.log()

  const write = await confirm('Write configuration to file?', true)
  if (!write) {
    console.log('\n  Setup cancelled. No file written.')
    closeRL()
    return
  }

  const dir = path.dirname(state.outputPath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  fs.writeFileSync(state.outputPath, yamlContent, 'utf-8')

  console.log(`\n  ${'─'.repeat(44)}`)
  console.log(`  Setup complete!`)
  console.log(`  ${'─'.repeat(44)}`)
  console.log(`\n  Config written: ${state.outputPath}`)
  console.log(`\n  Quick start commands:`)
  console.log(`    homectl host ls`)
  console.log(`    homectl service ls`)
  console.log(`    homectl context ls`)
  console.log(`    homectl stack ls`)
  console.log(`    homectl config validate`)
  console.log(`    homectl doctor all`)
  console.log(`    homectl auth check`)
  console.log(`\n  Edit ${state.outputPath} to add more hosts or services.\n`)
  closeRL()
}

function buildConfig(state: WizardState): Record<string, unknown> {
  const config: Record<string, unknown> = {
    version: 1,
    defaultContext: state.defaultContext,
    contexts: state.contexts,
    hosts: state.hosts,
    backup: state.backup,
  }

  if (state.backup.schedules && Object.keys(state.backup.schedules).length === 0) {
    delete (config.backup as Record<string, unknown>).schedules
  }

  return config
}
