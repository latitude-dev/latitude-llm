import { Command } from 'commander'
import { init, pull, push, checkout, status } from './commands'
import { help } from './commands/help'
import { readFileSync } from 'fs'

// Create the program
const program = new Command()

// Set basic information
program
  .name('latitude')
  .description('Latitude CLI for managing projects and prompts')
  .version(getVersion())

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

function getVersion() {
  const packageJson = JSON.parse(readFileSync('./package.json', 'utf8'))
  return packageJson.version
}
