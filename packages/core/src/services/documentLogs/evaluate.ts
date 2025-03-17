import {
  DocumentLog,
  EvaluationDto,
  Workspace,
  WorkspaceDto,
} from '../../browser'
import { findLastProviderLogFromDocumentLogUuid } from '../../data-access'
import { setupQueues } from '../../jobs'
import { NotFoundError, Result } from '../../lib'

export async function evaluateDocumentLog(
  documentLog: DocumentLog,
  workspace: WorkspaceDto | Workspace,
  { evaluations }: { evaluations?: EvaluationDto[] } = {},
) {
  const queues = await setupQueues()
  const providerLog = await findLastProviderLogFromDocumentLogUuid(
    documentLog.uuid,
  )
  if (!providerLog) {
    return Result.error(
      new NotFoundError(
        `Provider log not found for document log with uuid ${documentLog.uuid}`,
      ),
    )
  }

  evaluations?.forEach((evaluation) => {
    queues.evaluationsQueue.jobs.enqueueRunEvaluationJob({
      workspaceId: workspace.id,
      providerLogUuid: providerLog.uuid,
      documentUuid: documentLog.documentUuid,
      evaluationId: evaluation.id,
    })
  })
}
