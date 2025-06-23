import { Command } from 'commander'

/**
 * Register a command with Commander
 * @param program The Commander instance
 * @param name The command name
 * @param description The command description
 * @param CommandClass The command implementation class
 * @param options Additional options for the command configuration
 */
export function registerCommand(
  program: Command,
  name: string,
  description: string,
  CommandClass: new () => any,
  options: {
    arguments?: string[]
    options?: Array<{ flags: string; description: string; defaultValue?: any }>
    action: (command: any, ...args: any[]) => Promise<void>
  },
): void {
  // Create the command
  const cmd = program.command(name)
  cmd.description(description)

  // Add arguments
  if (options.arguments) {
    options.arguments.forEach((arg) => cmd.argument(arg, ''))
  }

  // Add options
  if (options.options) {
    options.options.forEach((opt) => {
      cmd.option(opt.flags, opt.description, opt.defaultValue)
    })
  }

  // Add action
  cmd.action(async (...args) => {
    const commandInstance = new CommandClass()
    await options.action(commandInstance, ...args)
  })
}
