import { updateExport } from './update'
import { publisher } from '../../events/publisher'
import type { Export } from '../../browser'

export async function markExportReady({ export: exportRecord }: { export: Export }) {
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
      uuid: exportRecord.uuid,
    },
  })

  return result
}
