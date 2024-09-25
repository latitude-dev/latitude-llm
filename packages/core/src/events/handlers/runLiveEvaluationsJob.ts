import { setupJobs } from '@latitude-data/jobs'

import { DocumentLogCreatedEvent } from '.'
import { findWorkspaceFromDocumentLog } from '../../data-access'
import { NotFoundError, Result } from '../../lib'
import { CommitsRepository, EvaluationsRepository } from '../../repositories'

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

  const commitId = documentLog.commitId
  const commitsScope = new CommitsRepository(workspace.id)
  const commit = await commitsScope.find(commitId).then((r) => r.unwrap())
  if (!commit.mergedAt) return Result.nil()

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
