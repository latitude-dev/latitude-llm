import chalk from 'chalk'

/**
 * Colored console logging utilities
 */
export const log = {
  info: (message: string) => console.log(chalk.cyan(message)),
  success: (message: string) => console.log(chalk.green(message)),
  warn: (message: string) => console.log(chalk.yellow(message)),
  error: (message: string) => console.error(chalk.red(message)),
  dim: (message: string) => console.log(chalk.dim(message)),
}
