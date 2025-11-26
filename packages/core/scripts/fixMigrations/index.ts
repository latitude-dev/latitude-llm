// Suppress blessed terminal capability errors by using simpler terminal type
// This must be set before importing blessed (via ui modules)
if (process.env['TERM']?.includes('256color')) {
  process.env['TERM'] = 'xterm'
}

import chalk from 'chalk'

import type { MainMenuAction, Migration } from './types'
import { getMigrations } from './data'
import { showBrowserScreen, showMainMenuScreen } from './ui'
import { applyAllMigrations } from './actions'

/**
 * Handle the selected menu action
 */
async function handleMenuAction(
  action: MainMenuAction,
  migrations: Migration[],
): Promise<void> {
  switch (action) {
    case 'apply':
      await applyAllMigrations(migrations)
      break

    case 'browse_all':
      showBrowserScreen(migrations, false, createRefreshCallback(false))
      break

    case 'browse_unapplied':
      showBrowserScreen(migrations, true, createRefreshCallback(true))
      break

    case 'exit':
      process.exit(0)
  }
}

/**
 * Create a refresh callback for the browser screens
 */
function createRefreshCallback(showOnlyUnapplied: boolean) {
  return async () => {
    const newMigrations = await getMigrations()
    showBrowserScreen(
      newMigrations,
      showOnlyUnapplied,
      createRefreshCallback(showOnlyUnapplied),
    )
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    const migrations = await getMigrations()

    // Show the blessed-based main menu
    showMainMenuScreen(migrations, (action) => {
      handleMenuAction(action, migrations)
    })
  } catch (error) {
    console.error(chalk.red('Error:'), error)
    process.exit(1)
  }
}

main()
