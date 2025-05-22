import { NewExport, Workspace } from '../../browser'
import { database } from '../../client'
import { latitudeExports } from '../../schema'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { findByUuid } from '../../data-access/exports/findByUuid'

export async function findOrCreateExport(
  {
    uuid,
    workspace,
    userId,
    fileKey,
  }: {
    uuid: string
    workspace: Workspace
    userId: string
    fileKey: string
  },
  db = database,
) {
  const existingExport = await findByUuid({ uuid, workspace }, db)
  if (existingExport) return Result.ok(existingExport)

  return Transaction.call(async (tx) => {
    const newExportData: NewExport = {
      uuid,
      workspaceId: workspace.id,
      userId,
      fileKey,
    }

    const [newExport] = await tx
      .insert(latitudeExports)
      .values(newExportData)
      .returning()

    if (!newExport) {
      throw new Error('Failed to create export')
    }

    return Result.ok(newExport)
  }, db)
}
