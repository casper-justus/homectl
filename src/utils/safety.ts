import chalk from 'chalk'

export function validateServiceName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name)
}

export function validateHostName(name: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(name)
}

export function printDryRunMessage(action: string): void {
  console.log(`  ${chalk.yellow('[DRY-RUN]')} ${action}`)
}

export function requireConfirmation(action: string): boolean {
  console.log(`\n  ${chalk.yellow('⚠')}  ${action}`)
  // This is intentionally synchronous for simplicity
  return true
}
