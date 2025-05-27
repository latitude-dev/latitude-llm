import { eq } from 'drizzle-orm'
import { Export } from '../../browser'
import { database } from '../../client'
import Transaction from '../../lib/Transaction'
import { latitudeExports } from '../../schema'
import { Result } from '../../lib/Result'

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
      .where(eq(latitudeExports.uuid, exportRecord.uuid))
      .returning()

    if (!updatedExport) {
      throw new Error('Failed to update export')
    }

    return Result.ok(updatedExport)
  }, db)
}
