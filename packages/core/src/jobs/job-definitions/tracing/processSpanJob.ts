import { Job } from 'bullmq'
import { Otlp } from '../../../browser'
import { unsafelyFindWorkspace } from '../../../data-access'
import { UnprocessableEntityError } from '../../../lib/errors'
import { ApiKeysRepository } from '../../../repositories'
import { processSpan } from '../../../services/tracing/spans/process'
import { captureException } from '../../../utils/workers/sentry'

export type ProcessSpanJobData = {
  span: Otlp.Span
  scope: Otlp.Scope
  apiKeyId: number
  workspaceId: number
}

export function processSpanJobKey({ span }: ProcessSpanJobData) {
  return `processSpanJob-${span.traceId}-${span.spanId}`
}

export const processSpanJob = async (job: Job<ProcessSpanJobData>) => {
  const { span, scope, apiKeyId, workspaceId } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) return

  const repository = new ApiKeysRepository(workspace.id)
  const finding = await repository.find(apiKeyId)
  if (finding.error) return
  const apiKey = finding.value

  const result = await processSpan({ span, scope, apiKey, workspace })
  if (result.error) {
    if (result.error instanceof UnprocessableEntityError) {
      if (process.env.NODE_ENV === 'development') captureException(result.error)
    } else throw result.error
  }
}
