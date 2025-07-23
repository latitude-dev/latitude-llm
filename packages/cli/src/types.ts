import { Command } from 'commander'

/**
 * Represents a command handler for the CLI
 */
export type CommandHandler = (program: Command) => void

/**
 * Common options for all commands
 */
export interface CommonOptions {
  path: string
  dev?: boolean
}

/**
 * Options for the init command
 */
export interface InitOptions extends CommonOptions {}

/**
 * Options for the status command
 */
export interface StatusOptions extends CommonOptions {}

/**
 * Options for the pull command
 */
export interface PullOptions extends CommonOptions {
  yes?: boolean
}

/**
 * Options for the checkout command
 */
export interface CheckoutOptions extends CommonOptions {
  branch?: string
}

/**
 * Options for the push command
 */
export interface PushOptions extends CommonOptions {
  yes?: boolean
}

/**
 * CLI configuration
 */
export interface CliConfig {
  apiKey?: string
  projectId?: string
  versionUuid?: string
}
