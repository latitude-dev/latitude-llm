import { Job, WaitingError } from 'bullmq'
import { SpanType } from '../../../constants'
import { SpansRepository } from '../../../repositories/spansRepository'
import { queues } from '../../queues'
import { RunEvaluationV2JobData } from './runEvaluationV2Job'

export type RunEvaluationForExperimentJobData = {
  workspaceId: number
  conversationUuid: string
  experimentUuid: string
  evaluationUuid: string
  commitId: number
  datasetId?: number
  datasetLabel?: string
  datasetRowId?: number
}

export async function runEvaluationForExperimentJob(
  job: Job<RunEvaluationForExperimentJobData>,
  token: string,
) {
  const { conversationUuid, workspaceId, ...rest } = job.data
  const spansRepo = new SpansRepository(workspaceId)
  const trace = await spansRepo
    .listTracesByLog(conversationUuid)
    .then((traces) => traces.at(-1))
  if (!trace) {
    job.moveToWait(token)
    throw new WaitingError('Waiting for trace')
  }

  const spans = await spansRepo
    .list({ traceId: trace })
    .then((r) => r.unwrap().filter((span) => span.type === SpanType.Prompt))
  const span = spans[0]
  if (!span) {
    job.moveToWait(token)
    throw new WaitingError('Waiting for span')
  }

  const { evaluationsQueue } = await queues()
  const payload: RunEvaluationV2JobData = {
    workspaceId,
    spanId: span.id,
    traceId: trace,
    ...rest,
  }

  evaluationsQueue.add('runEvaluationV2Job', payload)
}
