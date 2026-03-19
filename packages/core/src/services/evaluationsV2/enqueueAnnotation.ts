import { queues } from '../../jobs/queues'
import { AnnotateEvaluationV2JobData } from '../../jobs/job-definitions/evaluations/annotateEvaluationV2Job'
import { UnprocessableEntityError } from '../../lib/errors'
import { Result } from '../../lib/Result'

export async function enqueueAnnotateEvaluationV2(
  data: AnnotateEvaluationV2JobData,
) {
  const { evaluationsQueue } = await queues()
  const job = await evaluationsQueue.add('annotateEvaluationV2Job', data, {
    attempts: 1,
    deduplication: { id: data.resultUuid },
    jobId: data.resultUuid,
    removeOnComplete: true,
    removeOnFail: true,
    keepLogs: 0,
  })

  if (!job?.id) {
    return Result.error(
      new UnprocessableEntityError('Failed to enqueue annotation job'),
    )
  }

  return Result.nil()
}
