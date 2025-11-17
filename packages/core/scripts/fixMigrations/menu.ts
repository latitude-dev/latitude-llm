import inquirer from 'inquirer'
import chalk from 'chalk'
import { log } from './logger'
import {
  runMigration,
  markAsExecuted,
  openMigrationInEditor,
  readMigrationSQL,
} from './migration'
import { JournalEntry, MenuAction, MenuResult, MigrationAction } from './types'

async function showMigrationDetails(
  migration: JournalEntry,
): Promise<MenuResult> {
  const date = new Date(migration.when)
  const formattedDate = date.toISOString()
  const migrationSQL = readMigrationSQL(migration)

  console.log('\n' + '='.repeat(80))
  log.info(`${migration.tag}.sql - ${formattedDate}`)
  console.log()
  console.log(chalk.gray(migrationSQL))
  console.log('='.repeat(80))

  const answer = await inquirer.prompt<{ action: MigrationAction }>([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        {
          name: '📝 Open in editor',
          value: MigrationAction.Open,
          short: 'Open in editor',
        },
        {
          name: '✓  Mark as executed',
          value: MigrationAction.MarkAsExecuted,
          short: 'Mark as executed',
        },
        {
          name: '▶  Run',
          value: MigrationAction.Run,
          short: 'Run',
        },
        new inquirer.Separator(),
        {
          name: '←  Back',
          value: MigrationAction.Back,
          short: 'Back',
        },
      ],
    },
  ])

  switch (answer.action) {
    case MigrationAction.Open:
      openMigrationInEditor(migration)
      return { type: 'back' }

    case MigrationAction.MarkAsExecuted: {
      const success = await markAsExecuted(migration)
      if (!success) return { type: 'exit', code: 1 }

      return { type: 'continue' }
    }

    case MigrationAction.Run: {
      const success = await runMigration(migration)
      if (!success) return { type: 'exit', code: 1 }
      return { type: 'continue' }
    }

    case MigrationAction.Back:
      return { type: 'back' }
  }
}

export async function promptAndRunOne(
  unappliedMigrations: JournalEntry[],
  maxCreatedAt: bigint,
): Promise<MenuResult> {
  const total = unappliedMigrations.length

  if (total === 0) {
    log.success('✅ All migrations are correctly applied!')
    return { type: 'exit', code: 0 }
  }

  const willApplyCount = unappliedMigrations.filter(
    (m) => BigInt(m.when) > maxCreatedAt,
  ).length

  console.log(
    `Found ${total} unapplied migration(s): ${chalk.green(
      `${willApplyCount} will run with db:migrate`,
    )}, ${chalk.red(`${total - willApplyCount} will be skipped`)}\n`,
  )

  const migrationChoices = unappliedMigrations.map((migration) => {
    const date = new Date(migration.when)
    const formattedDate = date.toISOString().split('T')[0].replace(/-/g, '/')
    const willBeApplied = BigInt(migration.when) > maxCreatedAt
    const colorFn = willBeApplied ? chalk.green : chalk.red

    return {
      name: `${chalk.gray(formattedDate)} ${colorFn(migration.tag)}`,
      value: migration,
      short: migration.tag,
    }
  })

  const choices = [
    ...migrationChoices,
    new inquirer.Separator(),
    {
      name: '▶ Run All',
      value: MenuAction.RunAll,
      short: 'Run All',
    },
    {
      name: '✕ Close',
      value: MenuAction.Close,
      short: 'Close',
    },
  ]

  const answer = await inquirer.prompt<{
    migration: JournalEntry | MenuAction
  }>([
    {
      type: 'list',
      name: 'migration',
      message: 'Choose a migration to inspect:',
      choices,
      pageSize: 15,
    },
  ])

  if (answer.migration === MenuAction.Close) {
    console.log('\n👋 Goodbye!\n')
    return { type: 'exit', code: 0 }
  }

  if (answer.migration === MenuAction.RunAll) {
    log.info(`\nRunning all ${unappliedMigrations.length} migrations...\n`)

    let successCount = 0
    for (const migration of unappliedMigrations) {
      const success = await runMigration(migration)
      if (!success) {
        log.error(`\nStopped after ${successCount} successful migrations`)
        return { type: 'exit', code: 1 }
      }
      successCount++
    }

    log.success(`\n✓ All ${successCount} migrations applied successfully!\n`)
    return { type: 'exit', code: 0 }
  }

  // Show migration details menu
  return showMigrationDetails(answer.migration)
}
