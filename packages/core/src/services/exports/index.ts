import { database } from '../../client'
import { latitudeExports } from '../../schema/models/exports'
import { Export, NewExport, Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import { eq } from 'drizzle-orm'
import Transaction from '../../lib/Transaction'

export async function findOrCreateExport({
  token,
  workspace,
  userId,
}: {
  token: string
  workspace: Workspace
  userId: string
}, db = database) {
    const existingExport = await db
      .select()
      .from(latitudeExports)
      .where(eq(latitudeExports.token, token))
      .limit(1)
      .then((rows) => rows[0])

    if (existingExport) {
      return Result.ok(existingExport)
    }

    return Transaction.call(async (tx) => {
      // Create new export if not found
      const newExportData: NewExport = {
        token,
        workspaceId: String(workspace.id),
        userId,
      }

      const [newExport] = await tx
        .insert(latitudeExports)
        .values(newExportData)
        .returning()

      if (!newExport) {
        throw new Error('Failed to create export')
      }

      return Result.ok(newExport)
    })
}

export async function updateExport(
  {
    export: exportRecord,
    readyAt,
  }: {
    export: Export
    readyAt: Date
  },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const [updatedExport] = await tx
      .update(latitudeExports)
      .set({
        readyAt,
        updatedAt: new Date(),
      })
      .where(eq(latitudeExports.id, exportRecord.id))
      .returning()

    if (!updatedExport) {
      throw new Error('Failed to update export')
    }

    return Result.ok(updatedExport)
  }, db)
}
