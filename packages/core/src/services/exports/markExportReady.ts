import { exports } from '../../schema/models/exports'
import { updateExport } from '.'
import { publisher } from '../../events/publisher'

export async function markExportReady({
  export: exportRecord,
}: {
  export: typeof exports.$inferSelect
}) {
  const result = await updateExport({
    export: exportRecord,
    readyAt: new Date(),
  })

  if (result.error) return result

  publisher.publishLater({
    type: 'exportReady',
    data: {
      workspaceId: exportRecord.workspaceId,
      userId: exportRecord.userId,
      token: exportRecord.token,
    },
  })

  return result
}
