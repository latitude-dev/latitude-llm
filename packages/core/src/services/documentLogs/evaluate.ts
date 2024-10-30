import {
  DocumentLog,
  EvaluationDto,
  Workspace,
  WorkspaceDto,
} from '../../browser'
import { setupJobs } from '../../jobs'

export async function evaluateDocumentLog(
  documentLog: DocumentLog,
  workspace: WorkspaceDto | Workspace,
  { evaluations }: { evaluations?: EvaluationDto[] } = {},
) {
  const queues = await setupJobs()

  evaluations?.forEach((evaluation) => {
    queues.defaultQueue.jobs.enqueueRunEvaluationJob({
      workspaceId: workspace.id,
      documentLogUuid: documentLog.uuid,
      documentUuid: documentLog.documentUuid,
      evaluationId: evaluation.id,
    })
  })
}
