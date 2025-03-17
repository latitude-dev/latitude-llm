import {
  DocumentLog,
  EvaluationDto,
  Workspace,
  WorkspaceDto,
} from '../../browser'
import { findLastProviderLogFromDocumentLogUuid } from '../../data-access'
import { setupJobs } from '../../jobs'
import { NotFoundError, Result } from '../../lib'

export async function evaluateDocumentLog(
  documentLog: DocumentLog,
  workspace: WorkspaceDto | Workspace,
  { evaluations }: { evaluations?: EvaluationDto[] } = {},
) {
  const queues = await setupJobs()
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
    queues.defaultQueue.jobs.enqueueRunEvaluationJob({
      workspaceId: workspace.id,
      providerLogUuid: providerLog.uuid,
      documentUuid: documentLog.documentUuid,
      evaluationId: evaluation.id,
    })
  })
}
