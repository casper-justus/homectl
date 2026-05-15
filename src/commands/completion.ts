import { Command } from 'commander'
import { generateCompletion } from '../core/completion'

export function registerCompletionCommand(program: Command): void {
  program
    .command('completion')
    .description('Generate shell completion scripts')
    .argument('[shell]', 'Shell type (bash, zsh, fish)', 'bash')
    .action((shell: string) => {
      const supported = ['bash', 'zsh', 'fish']
      if (!supported.includes(shell)) {
        console.error(`Unsupported shell: '${shell}'. Supported: ${supported.join(', ')}`)
        process.exit(1)
      }
      const script = generateCompletion(shell as 'bash' | 'zsh' | 'fish')
      console.log(script)
    })
}
