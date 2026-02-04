import { MAIN_SPAN_TYPES, MainSpanType, SpanWithDetails } from '@latitude-data/constants'
import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { NotFoundError } from '../../../lib/errors'
import { isRetryableError } from '../../../lib/isRetryableError'
import {
  CommitsRepository,
  EvaluationsV2Repository,
  SpanMetadatasRepository,
  SpansRepository,
} from '../../../repositories'
import { runEvaluationV2 } from '../../../services/evaluationsV2/run'
import { captureException } from '../../../utils/datadogCapture'
import { DebouncedEvaluationJobData } from './runEvaluationV2Job'

export const debouncedEvaluationJob = async (
  job: Job<DebouncedEvaluationJobData>,
) => {
  const { workspaceId, commitId, evaluationUuid, spanId, traceId } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const spansRepo = new SpansRepository(workspace.id)
  const spansMetadataRepo = new SpanMetadatasRepository(workspace.id)

  const originalSpan = await spansRepo
    .get({ traceId, spanId })
    .then((r) => r.value)
  if (!originalSpan) return

  const latestSpan = await spansRepo
    .getLatestInTrace({ traceId, types: Array.from(MAIN_SPAN_TYPES) })
    .then((r) => r.value)

  if (!latestSpan) return

  if (latestSpan.id !== spanId) {
    return
  }

  const span = latestSpan

  try {
    const commitsRepository = new CommitsRepository(workspace.id)
    const commit = await commitsRepository
      .getCommitById(commitId)
      .then((r) => r.unwrap())

    if (!span.documentUuid) throw new NotFoundError('Span document not found')
    if (!span.documentLogUuid) {
      throw new NotFoundError('Span document log not found')
    }
    const metadata = await spansMetadataRepo
      .get({ spanId: span.id, traceId })
      .then((r) => r.unwrap())

    const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
    const evaluation = await evaluationsRepository
      .getAtCommitByDocument({
        commitUuid: commit.uuid,
        documentUuid: span.documentUuid,
        evaluationUuid: evaluationUuid,
      })
      .then((r) => r.unwrap())

    await runEvaluationV2({
      evaluation,
      span: { ...span, metadata } as SpanWithDetails<MainSpanType>,
      commit,
      workspace,
    }).then((r) => r.unwrap())
  } catch (error) {
    if (isRetryableError(error as Error)) throw error
    captureException(error as Error)
  }
}
