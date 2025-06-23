import { Command } from 'commander'
import { init, pull, push, checkout, status } from './commands'
import { help } from './commands/help'
import { readFileSync } from 'fs'

// Create the program
const program = new Command()
const file = readFileSync('./package.json')
const j = JSON.parse(file.toString())

// Set basic information
program
  .name('latitude')
  .description('Latitude CLI for managing projects and prompts')
  .version(j.version)

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
