import { spawn } from 'child_process'
import path from 'path'

import chalk from 'chalk'

import type { Migration } from '../types'

/**
 * Open a migration file in the default editor
 */
export async function editMigration(migration: Migration): Promise<void> {
  const sqlPath = path.join(process.cwd(), 'drizzle', migration.fileName)
  const editor = process.env['EDITOR'] || 'code'

  console.log(chalk.cyan(`\nOpened ${migration.fileName} in ${editor}\n`))

  spawn(editor, [sqlPath], {
    stdio: 'inherit',
    detached: true,
  }).unref()
}
