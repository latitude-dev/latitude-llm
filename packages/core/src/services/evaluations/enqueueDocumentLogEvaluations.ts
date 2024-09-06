import { DocumentLog } from '../../browser'
import { database } from '../../client'
import { findWorkspaceFromDocumentLog } from '../../data-access'
import { jobs } from '../../jobs'
import { EvaluationsRepository } from '../../repositories'

export async function enqueueDocumentLogEvaluations(
  documentLog: DocumentLog,
  db = database,
) {
  const workspace = await findWorkspaceFromDocumentLog(documentLog)
  const scope = new EvaluationsRepository(workspace!.id, db)
  const evaluations = await scope.findByDocumentUuid(documentLog.documentUuid)

  evaluations.forEach((evaluation) =>
    jobs.queues.defaultQueue.jobs.enqueueEvaluateDocumentLogJob({
      documentLog,
      evaluation,
    }),
  )
}
