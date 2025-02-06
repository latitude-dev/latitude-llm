import { Job } from 'bullmq'

import { DocumentLog, EvaluationDto } from '../../../browser'
import { findLastProviderLogFromDocumentLogUuid } from '../../../data-access'
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
  // Document logs can be generated without a provider log (in case of error), so we don't want to fail the job
  if (!providerLog) return

  return await runEvaluation({
    providerLog,
    evaluation,
    documentUuid,
  }).then((r) => r.unwrap())
}
