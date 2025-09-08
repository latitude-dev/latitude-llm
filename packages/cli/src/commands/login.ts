import { Command } from 'commander'
import inquirer from 'inquirer'
import { BaseCommand } from '../utils/baseCommand'
import { registerCommand } from '../utils/commandRegistrar'

type LoginOptions = {
  apiKey?: string
  force?: boolean
}

/**
 * Sets/overrides the stored Latitude API key
 */
export class LoginCommand extends BaseCommand {
  async execute(options: LoginOptions): Promise<void> {
    try {
      const envApiKey = process.env.LATITUDE_API_KEY

      // Check if any API key is already configured (env or keychain)
      let hasExisting = false
      try {
        await this.configManager.getApiKey()
        hasExisting = true
      } catch (_) {
        hasExisting = false
      }

      // Warn if env var will take precedence
      if (envApiKey) {
        console.log(
          '⚠ LATITUDE_API_KEY environment variable is set and will take precedence over the stored key.',
        )
      }

      // Confirm override if something is configured unless forced
      if (hasExisting && !options.force) {
        const { confirm } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirm',
            message:
              'An API key is already configured. Do you want to override it?',
            default: true,
          },
        ])
        if (!confirm) {
          console.log('Login cancelled. Existing configuration left unchanged.')
          return
        }
      }

      // Get API key from flag or prompt
      const apiKey = options.apiKey
        ? options.apiKey
        : (
            await inquirer.prompt([
              {
                type: 'password',
                name: 'apiKey',
                message: 'Enter your Latitude API key:',
                validate: (input: string) =>
                  input.trim() !== '' ? true : 'API key is required',
              },
            ])
          ).apiKey

      await this.configManager.setApiKey(apiKey)

      console.log('✅ API key saved to system keychain')
      if (envApiKey) {
        console.log(
          'Note: LATITUDE_API_KEY env var is set; unset it to use the stored key.',
        )
      }
    } catch (error: any) {
      this.handleError(error, 'Login')
    }
  }
}

/**
 * Register the login command
 */
export function login(program: Command): void {
  registerCommand(
    program,
    'login',
    'Authenticate by setting your API key',
    LoginCommand,
    {
      options: [
        {
          flags: '--api-key <apiKey>',
          description: 'API key to store (will override existing one)',
        },
        {
          flags: '-f, --force',
          description: 'Override without confirmation',
        },
      ],
      action: async (command, options: LoginOptions) => {
        await command.execute(options)
      },
    },
  )
}
