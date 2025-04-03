import {
  DocumentLog,
  EvaluationDto,
  Workspace,
  WorkspaceDto,
} from '../../browser'
import { findLastProviderLogFromDocumentLogUuid } from '../../data-access'
import { evaluationsQueue } from '../../jobs/queues'
import { NotFoundError, Result } from '../../lib'

export async function evaluateDocumentLog(
  documentLog: DocumentLog,
  workspace: WorkspaceDto | Workspace,
  { evaluations }: { evaluations?: EvaluationDto[] } = {},
) {
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
    evaluationsQueue.add('runEvaluationJob', {
      workspaceId: workspace.id,
      providerLogUuid: providerLog.uuid,
      documentUuid: documentLog.documentUuid,
      evaluationId: evaluation.id,
    })
  })
}
