import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queues } from '../../jobs/queues'
import { type AnnotateEvaluationV2JobData } from '../../jobs/job-definitions/evaluations/annotateEvaluationV2Job'
import { enqueueAnnotateEvaluationV2 } from './enqueueAnnotation'

vi.mock('../../jobs/queues')

const mockQueueAdd = vi.fn()

function buildJobData(): AnnotateEvaluationV2JobData {
  return {
    workspaceId: 1,
    conversationUuid: 'conversation-uuid',
    evaluationUuid: 'evaluation-uuid',
    score: 1,
    resultUuid: 'result-uuid',
  }
}

describe('enqueueAnnotateEvaluationV2', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockQueueAdd.mockResolvedValue({ id: 'job-id' })

    vi.mocked(queues).mockResolvedValue({
      evaluationsQueue: { add: mockQueueAdd },
    } as any)
  })

  it('enqueues annotation jobs with bounded exponential retries', async () => {
    const data = buildJobData()

    const result = await enqueueAnnotateEvaluationV2(data)

    expect(result.ok).toBe(true)
    expect(mockQueueAdd).toHaveBeenCalledWith('annotateEvaluationV2Job', data, {
      attempts: 8,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      deduplication: { id: data.resultUuid },
      jobId: data.resultUuid,
      removeOnComplete: true,
      removeOnFail: true,
      keepLogs: 0,
    })
  })

  it('returns an error when queueing fails', async () => {
    mockQueueAdd.mockResolvedValueOnce(undefined)

    const result = await enqueueAnnotateEvaluationV2(buildJobData())

    expect(result.ok).toBe(false)
    expect(result.error?.message).toBe('Failed to enqueue annotation job')
  })
})
