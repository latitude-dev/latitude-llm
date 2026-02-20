import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { database } from '../../src/client'
import { sql } from 'drizzle-orm'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const MIGRATIONS_DIR = path.join(__dirname)

/**
 * Runs all SQL migrations in the migrations folder.
 * Migrations are idempotent and can be safely rerun multiple times.
 */
export async function runMigrations(): Promise<void> {
  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort()

  if (migrationFiles.length === 0) {
    console.log('No migration files found')
    return
  }

  console.log(`Found ${migrationFiles.length} migration file(s)`)

  for (const filename of migrationFiles) {
    const filepath = path.join(MIGRATIONS_DIR, filename)
    const sqlContent = fs.readFileSync(filepath, 'utf-8')

    console.log(`  🔄 Running: ${filename}`)

    try {
      await database.execute(sql.raw(sqlContent))
      console.log(`  ✅ Done: ${filename}`)
    } catch (error) {
      console.error(`  ❌ Failed to run ${filename}:`, error)
      throw error
    }
  }

  console.log(`✓ All migrations complete`)
}
