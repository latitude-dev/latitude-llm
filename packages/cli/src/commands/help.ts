import type { Command } from 'commander'

/**
 * Display help information
 */
export function help(program: Command): void {
  program
    .command('help')
    .description('Display help information')
    .action(() => {
      program.help()
    })
}
