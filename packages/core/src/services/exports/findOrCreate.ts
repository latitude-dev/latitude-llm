import { NewExport, Workspace } from '../../browser'
import { findByUuid } from '../../data-access/exports/findByUuid'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { latitudeExports } from '../../schema'

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
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const existingExport = await findByUuid({ uuid, workspace }, tx)
    if (existingExport) return Result.ok(existingExport)

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
  })
}
