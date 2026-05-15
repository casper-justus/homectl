import * as readline from 'readline'
import chalk from 'chalk'

let sharedRL: readline.Interface | null = null
let inputQueue: string[] = []

function getRL(): readline.Interface {
  if (!sharedRL) {
    sharedRL = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })
  }
  return sharedRL
}

export function closeRL(): void {
  if (sharedRL) {
    sharedRL.close()
    sharedRL = null
  }
}

function isTTY(): boolean {
  return process.stdin.isTTY && process.stdout.isTTY
}

// ANSI cursor/clear sequences (safe on all modern terminals)
const CUU = (n: number) => `\x1b[${n}A` // cursor up
const CUD = (n: number) => `\x1b[${n}B` // cursor down
const EL = '\x1b[2K\r'                   // erase line, carriage return

export async function initInputQueue(): Promise<void> {
  if (isTTY()) return
  return new Promise((resolve) => {
    const rl = getRL()
    rl.on('line', (line) => inputQueue.push(line))
    rl.on('close', () => resolve())
    if (process.stdin.readableEnded) return resolve()
    setTimeout(() => resolve(), 100)
  })
}

function nextInputLine(): string {
  return inputQueue.shift() || ''
}

export function clearScreen(): void {
  if (isTTY()) {
    process.stdout.write('\x1b[2J\x1b[H')
  }
}

export function printBanner(): void {
  console.log('')
  console.log(`  ${chalk.bold.cyan('╔══════════════════════════════════╗')}`)
  console.log(`  ${chalk.bold.cyan('║         homectl setup             ║')}`)
  console.log(`  ${chalk.bold.cyan('╚══════════════════════════════════╝')}`)
  console.log('')
  console.log(`  ${chalk.dim('Configure your homelab infrastructure')}`)
  console.log(`  ${chalk.dim('Press Ctrl+C anytime to cancel.')}`)
  console.log('')
}

export function printStep(step: number, total: number, title: string): void {
  console.log(`\n  ${chalk.bold.cyan(`[${step}/${total}]`)} ${chalk.bold(title)}`)
  console.log(`  ${chalk.dim('─'.repeat(Math.max(0, 40 - title.length)))}`)
}

export function printSuccess(msg: string): void {
  console.log(`  ${chalk.green('✓')} ${msg}`)
}

export function printInfo(msg: string): void {
  console.log(`  ${chalk.dim('ℹ')} ${msg}`)
}

export function printWarning(msg: string): void {
  console.log(`  ${chalk.yellow('⚠')} ${msg}`)
}

export async function prompt(
  question: string,
  defaultVal?: string,
): Promise<string> {
  const suffix = defaultVal ? ` ${chalk.dim(`[${defaultVal}]`)}` : ''
  process.stdout.write(`  ${chalk.cyan('?')} ${question}${suffix} `)

  return new Promise((resolve) => {
    if (!isTTY()) {
      const answer = nextInputLine()
      process.stdout.write(`${answer}\n`)
      resolve(answer.trim() || defaultVal || '')
      return
    }
    getRL().question('', (answer) => {
      resolve(answer.trim() || defaultVal || '')
    })
  })
}

export async function confirm(
  question: string,
  defaultVal = true,
): Promise<boolean> {
  const hint = defaultVal ? 'Y/n' : 'y/N'
  process.stdout.write(`  ${chalk.cyan('?')} ${question} ${chalk.dim(`(${hint})`)} `)

  return new Promise((resolve) => {
    if (!isTTY()) {
      const answer = nextInputLine()
      process.stdout.write(`${answer}\n`)
      resolve(parseConfirm(answer, defaultVal))
      return
    }
    getRL().question('', (answer) => {
      resolve(parseConfirm(answer, defaultVal))
    })
  })
}

function parseConfirm(input: string, defaultVal: boolean): boolean {
  const trimmed = input.trim().toLowerCase()
  if (trimmed === '') return defaultVal
  return trimmed === 'y' || trimmed === 'yes'
}

export async function select(
  question: string,
  choices: string[],
  defaultIndex = 0,
): Promise<string> {
  const CH = choices.length + 2 // total lines to manage

  console.log(`  ${chalk.cyan('?')} ${question}`)

  const render = (sel: number) =>
    choices
      .map((c, i) => {
        const ptr = i === sel ? chalk.green('❯') : ' '
        const style = i === sel ? (s: string) => s : chalk.dim
        return `  ${ptr} ${style(`${i + 1}. ${c}`)}`
      })
      .join('\n')

  let cur = defaultIndex

  return new Promise((resolve) => {
    console.log(render(cur))
    console.log(`  ${chalk.dim('(Use ↑↓ to navigate, Enter to confirm)')}`)

    if (!isTTY()) {
      const answer = nextInputLine()
      const trimmed = answer.trim()
      let idx = defaultIndex
      if (trimmed) {
        const parsed = parseInt(trimmed, 10) - 1
        if (parsed >= 0 && parsed < choices.length) idx = parsed
      }
      resolve(choices[idx])
      return
    }

    const stdin = process.stdin
    const handler = (buf: Buffer) => {
      const key = buf.toString()
      if (key === '\x1b[A' || key === 'k') {
        cur = Math.max(0, cur - 1)
        process.stdout.write(`${CUU(CH)}${render(cur)}\n`)
        process.stdout.write(`  ${chalk.dim('(Use ↑↓ to navigate, Enter to confirm)')}${CUU(CH)}`)
      } else if (key === '\x1b[B' || key === 'j') {
        cur = Math.min(choices.length - 1, cur + 1)
        process.stdout.write(`${CUU(CH)}${render(cur)}\n`)
        process.stdout.write(`  ${chalk.dim('(Use ↑↓ to navigate, Enter to confirm)')}${CUU(CH)}`)
      } else if (key === '\r' || key === '\n') {
        try { stdin.setRawMode(false) } catch {}
        stdin.removeListener('data', handler)
        // Clear the menu area
        for (let i = 0; i < CH; i++) process.stdout.write(`${EL}${i < CH - 1 ? CUD(1) : ''}`)
        process.stdout.write(CUU(CH))
        console.log(`  ${chalk.cyan('?')} ${question} ${chalk.green(choices[cur])}`)
        resolve(choices[cur])
      }
    }

    try {
      stdin.setRawMode(true)
      stdin.resume()
      stdin.on('data', handler)
    } catch {
      // Raw mode not supported (e.g. Windows PowerShell ISE) — fall back to numbered input
      stdin.removeListener('data', handler)
      getRL().question('  Enter choice number: ', (answer) => {
        const trimmed = answer.trim()
        let idx = defaultIndex
        if (trimmed) {
          const parsed = parseInt(trimmed, 10) - 1
          if (parsed >= 0 && parsed < choices.length) idx = parsed
        }
        resolve(choices[idx])
      })
    }
  })
}

export async function multiselect(
  question: string,
  choices: string[],
  defaultSelected: string[] = [],
): Promise<string[]> {
  const CH = choices.length + 2
  const sel = new Set(defaultSelected)

  console.log(`  ${chalk.cyan('?')} ${question}`)

  const render = (curs: number) =>
    choices
      .map((c, i) => {
        const check = sel.has(c) ? chalk.green('✓') : ' '
        const ptr = i === curs ? chalk.green('❯') : ' '
        return `  ${ptr} [${check}] ${c}`
      })
      .join('\n')

  let cur = 0

  return new Promise((resolve) => {
    console.log(render(cur))
    console.log(`  ${chalk.dim('(Space to toggle, Enter to confirm)')}`)

    if (!isTTY()) {
      const answer = nextInputLine()
      const trimmed = answer.trim()
      if (!trimmed) { resolve(defaultSelected); return }
      const indices = trimmed.split(',').map((s) => parseInt(s.trim(), 10) - 1)
      resolve(indices.filter((i) => i >= 0 && i < choices.length).map((i) => choices[i]))
      return
    }

    const stdin = process.stdin
    const handler = (buf: Buffer) => {
      const key = buf.toString()
      if (key === '\x1b[A' || key === 'k') {
        cur = Math.max(0, cur - 1)
        process.stdout.write(`${CUU(CH)}${render(cur)}\n`)
        process.stdout.write(`  ${chalk.dim('(Space to toggle, Enter to confirm)')}${CUU(CH)}`)
      } else if (key === '\x1b[B' || key === 'j') {
        cur = Math.min(choices.length - 1, cur + 1)
        process.stdout.write(`${CUU(CH)}${render(cur)}\n`)
        process.stdout.write(`  ${chalk.dim('(Space to toggle, Enter to confirm)')}${CUU(CH)}`)
      } else if (key === ' ') {
        const c = choices[cur]
        if (sel.has(c)) sel.delete(c); else sel.add(c)
        process.stdout.write(`${CUU(CH)}${render(cur)}\n`)
        process.stdout.write(`  ${chalk.dim('(Space to toggle, Enter to confirm)')}${CUU(CH)}`)
      } else if (key === '\r' || key === '\n') {
        try { stdin.setRawMode(false) } catch {}
        stdin.removeListener('data', handler)
        const result = Array.from(sel)
        for (let i = 0; i < CH; i++) process.stdout.write(`${EL}${i < CH - 1 ? CUD(1) : ''}`)
        process.stdout.write(CUU(CH))
        const label = result.length > 0 ? result.join(', ') : '(none)'
        console.log(`  ${chalk.cyan('?')} ${question} ${chalk.green(label)}`)
        resolve(result)
      }
    }

    try {
      stdin.setRawMode(true)
      stdin.resume()
      stdin.on('data', handler)
    } catch {
      stdin.removeListener('data', handler)
      getRL().question('  Enter comma-separated numbers: ', (answer) => {
        const trimmed = answer.trim()
        if (!trimmed) { resolve(defaultSelected); return }
        const indices = trimmed.split(',').map((s) => parseInt(s.trim(), 10) - 1)
        resolve(indices.filter((i) => i >= 0 && i < choices.length).map((i) => choices[i]))
      })
    }
  })
}

export async function password(question: string): Promise<string> {
  process.stdout.write(`  ${chalk.cyan('?')} ${question} ${chalk.dim('(hidden)')} `)

  return new Promise((resolve) => {
    if (!isTTY()) {
      const answer = nextInputLine()
      process.stdout.write(`\n`)
      resolve(answer.trim())
      return
    }

    const stdin = process.stdin
    const wasRaw = stdin.isRaw
    if (wasRaw) try { stdin.setRawMode(false) } catch {}

    // Mask input by intercepting stdout write
    const orig = (process.stdout as any)._writeToOutput
    if (orig) {
      ;(process.stdout as any)._writeToOutput = (s: string) => {
        if (s.includes('\n') || s.includes('\r')) orig.call(process.stdout, s)
        else orig.call(process.stdout, '*'.repeat(s.length))
      }
    }

    getRL().question('', (answer) => {
      if (orig) (process.stdout as any)._writeToOutput = orig
      if (wasRaw) try { stdin.setRawMode(true) } catch {}
      console.log()
      resolve(answer.trim())
    })
  })
}

export async function pressEnter(): Promise<void> {
  process.stdout.write(`  ${chalk.dim('Press Enter to continue...')}`)

  return new Promise((resolve) => {
    if (!isTTY()) {
      nextInputLine()
      process.stdout.write('\n')
      resolve()
      return
    }
    getRL().question('', () => resolve())
  })
}
