import { Job } from 'bullmq'

import { DocumentLog, EvaluationDto } from '../../../browser'
import { runEvaluation } from '../../../services/evaluations'

export const runLiveEvaluationJob = async (
  job: Job<{
    evaluation: EvaluationDto
    documentLog: DocumentLog
    documentUuid: string
  }>,
) => {
  const { evaluation, documentLog, documentUuid } = job.data

  const { response } = await runEvaluation({
    documentLog,
    evaluation,
    documentUuid,
  }).then((r) => r.unwrap())

  await response
}
