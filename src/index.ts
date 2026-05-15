#!/usr/bin/env node

import { createCLI } from './cli'

async function main(): Promise<void> {
  const program = createCLI()
  await program.parseAsync(process.argv)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
