import { DocumentLog, EvaluationDto } from '@latitude-data/core/browser'
import { runEvaluation } from '@latitude-data/core/services/evaluations/run'
import { Job } from 'bullmq'

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
