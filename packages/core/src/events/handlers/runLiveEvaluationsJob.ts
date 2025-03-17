import {
  LogSources,
  NON_LIVE_EVALUABLE_LOG_SOURCES,
} from '@latitude-data/constants'
import { findWorkspaceFromDocumentLog } from '../../data-access'
import { setupQueues } from '../../jobs'
import { NotFoundError } from '../../lib'
import { EvaluationsRepository } from '../../repositories'
import { DocumentLogCreatedEvent } from '../events'

export function isLiveEvaluableSource(source: LogSources | null | undefined) {
  if (!source) return true

  return !NON_LIVE_EVALUABLE_LOG_SOURCES.includes(source)
}

export const runLiveEvaluationsJob = async ({
  data: event,
}: {
  data: DocumentLogCreatedEvent
}) => {
  const { data: documentLog } = event
  if (!isLiveEvaluableSource(documentLog.source)) return

  const workspace = await findWorkspaceFromDocumentLog(documentLog)
  if (!workspace) {
    throw new NotFoundError('Workspace not found')
  }
  const scope = new EvaluationsRepository(workspace.id)
  const evaluations = await scope
    .findByDocumentUuid(documentLog.documentUuid)
    .then((r) => r.unwrap())

  const queues = await setupQueues()
  evaluations
    .filter((ev) => !!ev.live)
    .forEach((ev) => {
      queues.liveEvaluationsQueue.jobs.enqueueRunLiveEvaluationJob({
        evaluation: ev,
        documentLog,
        documentUuid: documentLog.documentUuid,
      })
    })
}
