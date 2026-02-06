import { publisher } from '../../events/publisher'
import { RunMetrics } from '../../jobs/job-definitions/runs/helpers/types'
import { Result } from '../../lib/Result'
import { deleteActiveRunByDocument } from './active/byDocument/delete'

export type { RunMetrics }

export async function endRun({
  workspaceId,
  projectId,
  documentUuid,
  commitUuid,
  runUuid,
  metrics,
  experimentId,
}: {
  workspaceId: number
  projectId: number
  documentUuid: string
  commitUuid: string
  runUuid: string
  metrics?: RunMetrics
  experimentId?: number
}) {
  const deleteResult = await deleteActiveRunByDocument({
    workspaceId,
    projectId,
    documentUuid,
    runUuid,
  })

  if (!Result.isOk(deleteResult)) return deleteResult

  const run = deleteResult.unwrap()

  await publisher.publishLater({
    type: 'documentRunEnded',
    data: {
      projectId,
      workspaceId,
      documentUuid,
      commitUuid,
      run,
      eventContext: 'background',
      metrics,
      experimentId,
    },
  })

  return deleteResult
}
