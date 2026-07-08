import { captureException } from '$/common/tracer'
import {
  AssertedStreamType,
  ChainStepResponse,
  PromptSource,
  RunSyncAPIResponse,
  StreamType,
} from '@latitude-data/constants'
import { LatitudeError } from '@latitude-data/constants/errors'
import { CostBreakdown, totalCost } from '@latitude-data/constants/costs'
import { Result, TypedResult } from '@latitude-data/core/lib/Result'

/**
 * Builds the synchronous run API response.
 *
 * When available, `cost` and `usage` are taken from the accumulated run totals
 * (`runCost` / `runUsage`), which include every step and sub-agent LLM call in
 * the run. This matches what the Traces tab reports. The last step's
 * `response.cost` / `response.usage` only reflect the final completion and
 * under-report runs that use sub-prompts, so they are used only as a fallback
 * (e.g. when attaching to a background run, where the totals are not available).
 */
export function runPresenter({
  response,
  runCost,
  runUsage,
  source,
}: {
  response: ChainStepResponse<StreamType>
  runCost?: CostBreakdown
  runUsage?: ChainStepResponse<StreamType>['usage']
  source?: PromptSource
}): TypedResult<RunSyncAPIResponse<AssertedStreamType>, LatitudeError> {
  const conversation = response.input
  const uuid = response.documentLogUuid
  const errorMessage = !uuid
    ? 'Document Log uuid not found in response'
    : !conversation
      ? 'Conversation messages not found in response'
      : undefined

  const error = errorMessage ? new LatitudeError(errorMessage) : undefined
  if (error) {
    captureException(error)
    return Result.error(error)
  }

  const type = response.streamType

  return Result.ok({
    uuid: uuid!,
    conversation: conversation!,
    response: {
      cost: runCost ? totalCost(runCost) : response.cost,
      input: response.input,
      model: response.model,
      object: type === 'object' ? response.object : undefined,
      output: response.output,
      provider: response.provider,
      streamType: type,
      text: response.text,
      toolCalls: type === 'text' ? response.toolCalls : [],
      usage: runUsage ?? response.usage!,
    },
    source,
  })
}
