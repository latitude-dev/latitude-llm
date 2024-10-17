import { Job } from 'bullmq'

import { DocumentLog, EvaluationDto } from '../../../browser'
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

  const { response } = await runEvaluation({
    documentLog,
    evaluation,
    documentUuid,
  }).then((r) => r.unwrap())

  await response
}
