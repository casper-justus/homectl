import chalk from 'chalk'

export function handleError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`\n  ${chalk.red('Error:')} ${message}`)
  process.exit(1)
}

export function formatError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}
