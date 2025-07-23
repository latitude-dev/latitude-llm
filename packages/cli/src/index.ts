import { Command } from 'commander'
import { init, pull, push, checkout, status } from './commands'
import { help } from './commands/help'
import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

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
  // Get the directory of the current file
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = dirname(__filename)

  // Navigate to the package.json file (from dist/ back to root)
  const packageJsonPath = join(__dirname, '..', 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  return packageJson.version
}
