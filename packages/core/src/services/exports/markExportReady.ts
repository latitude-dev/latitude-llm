import { updateExport } from '.'
import { publisher } from '../../events/publisher'
import { Export } from '../../browser'

export async function markExportReady({
  export: exportRecord,
}: {
  export: Export
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
