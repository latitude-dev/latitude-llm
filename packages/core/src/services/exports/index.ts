import { database } from '../../client'
import { exports, type NewExport } from '../../schema/models/exports'
import { Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import Transaction from '../../lib/Transaction'

export async function findOrCreateExport({
  token,
  workspace,
  userId,
}: {
  token: string
  workspace: Workspace
  userId: string
}) {
  try {
    // Try to find existing export
    const existingExport = await database
      .select()
      .from(exports)
      .where(eq(exports.token, token))
      .limit(1)
      .then((rows) => rows[0])

    if (existingExport) {
      return Result.ok(existingExport)
    }

    // Create new export if not found
    const newExportData: NewExport = {
      token,
      workspaceId: String(workspace.id),
      userId,
    }

    const [newExport] = await database
      .insert(exports)
      .values(newExportData)
      .returning()

    if (!newExport) {
      throw new Error('Failed to create export')
    }

    return Result.ok(newExport)
  } catch (error) {
    return Result.error(error as Error)
  }
}

export async function updateExport(
  {
    export: exportRecord,
    readyAt,
  }: {
    export: typeof exports.$inferSelect
    readyAt: Date
  },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const [updatedExport] = await tx
      .update(exports)
      .set({
        readyAt,
        updatedAt: new Date(),
      })
      .where(eq(exports.id, exportRecord.id))
      .returning()

    if (!updatedExport) {
      throw new Error('Failed to update export')
    }

    return Result.ok(updatedExport)
  }, db)
}
