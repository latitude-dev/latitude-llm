import { Database, database } from '../../client'
import { users } from '../../schema/models/users'

/**
 * Returns whether the instance has at least one user. Used to detect the very
 * first user setting up a self-hosted instance.
 */
export async function unsafelyCheckIfAnyUserExists(
  db: Database = database,
): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).limit(1)
  return rows.length > 0
}
