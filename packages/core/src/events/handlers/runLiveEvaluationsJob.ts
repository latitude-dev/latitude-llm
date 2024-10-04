import { setupJobs } from '@latitude-data/jobs'

import { findWorkspaceFromDocumentLog } from '../../data-access'
import { NotFoundError } from '../../lib'
import { EvaluationsRepository } from '../../repositories'
import { DocumentLogCreatedEvent } from '../events'

export const runLiveEvaluationsJob = async ({
  data: event,
}: {
  data: DocumentLogCreatedEvent
}) => {
  const { data: documentLog } = event
  const workspace = await findWorkspaceFromDocumentLog(documentLog)
  if (!workspace) {
    throw new NotFoundError('Workspace not found')
  }
  const scope = new EvaluationsRepository(workspace.id)
  const evaluations = await scope
    .findByDocumentUuid(documentLog.documentUuid)
    .then((r) => r.unwrap())

  const jobs = await setupJobs()
  evaluations
    .filter((ev) => !!ev.live)
    .forEach((ev) => {
      jobs.liveEvaluationsQueue.jobs.enqueueRunLiveEvaluationJob({
        evaluation: ev,
        documentLog,
        documentUuid: documentLog.documentUuid,
      })
    })
}
