import { Command } from 'commander'
import { init, pull, push, checkout, status } from './commands'
import { help } from './commands/help'

// Create the program
const program = new Command()

// Set basic information
program
  .name('latitude')
  .description('Latitude CLI for managing projects and prompts')
  .version('1.0.0')

// Register all commands
init(program)
pull(program)
push(program)
checkout(program)
status(program)
help(program)

// Parse command line arguments
program.parse(process.argv)

// If no arguments are provided, show help
if (process.argv.length <= 2) {
  program.help()
}
