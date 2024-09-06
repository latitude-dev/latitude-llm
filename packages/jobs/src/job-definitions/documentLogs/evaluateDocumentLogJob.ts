import { DocumentLog, EvaluationDto } from '@latitude-data/core/browser'
import { evaluateDocumentLog } from '@latitude-data/core/services/evaluations/evaluateDocumentLog'
import { Job } from 'bullmq'

export const evaluateDocumentLogJob = async (
  job: Job<{ documentLog: DocumentLog; evaluation: EvaluationDto }>,
) => {
  const { documentLog, evaluation } = job.data

  await evaluateDocumentLog({ documentLog, evaluation })
}
