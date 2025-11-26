import type { Migration, OperationResult } from '../types'
import { markMigrationApplied, unmarkMigrationApplied } from '../data'

/**
 * Toggle a migration's applied status
 * - If applied: remove from applied list
 * - If not applied: mark as applied
 */
export async function toggleMigrationStatus(
  migration: Migration,
): Promise<OperationResult> {
  if (migration.isApplied) {
    return unmarkMigrationApplied(migration)
  } else {
    return markMigrationApplied(migration)
  }
}
