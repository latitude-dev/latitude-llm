import { Job } from 'bullmq'

import { DocumentLog, EvaluationDto } from '../../../browser'
import { findLastProviderLogFromDocumentLogUuid } from '../../../data-access'
import { NotFoundError } from '../../../lib'
import { runEvaluation } from '../../../services/evaluations'

export type RunLiveEvaluationJobData = {
  evaluation: EvaluationDto
  documentLog: DocumentLog
  documentUuid: string
}

export const runLiveEvaluationJob = async (
  job: Job<RunLiveEvaluationJobData>,
) => {
  const { evaluation, documentLog, documentUuid } = job.data
  const providerLog = await findLastProviderLogFromDocumentLogUuid(
    documentLog.uuid,
  )
  if (!providerLog)
    throw new NotFoundError(
      `Provider log not found for document log ${documentLog.uuid}`,
    )

  const { response } = await runEvaluation({
    providerLog,
    evaluation,
    documentUuid,
  }).then((r) => r.unwrap())

  await response
}
