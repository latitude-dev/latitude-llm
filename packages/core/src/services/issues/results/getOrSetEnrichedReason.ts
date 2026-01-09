import {
  EvaluationMetric,
  EvaluationResultSuccessValue,
  EvaluationResultV2,
  EvaluationType,
  EvaluationV2,
  HumanEvaluationMetric,
  HumanEvaluationResultMetadata,
} from '@latitude-data/constants'
import { getEvaluationMetricSpecification } from '../../evaluationsV2/specifications'
import { Result } from '../../../lib/Result'
import { env } from '@latitude-data/env'
import { getCopilot, runCopilot } from '../../copilot'
import z from 'zod'
import Transaction from '../../../lib/Transaction'
import { BadRequestError } from '@latitude-data/constants/errors'
import { updateEvaluationResultV2 } from '../../evaluationsV2/results/update'
import { unsafelyFindWorkspace } from '../../../data-access/workspaces'
import { findCommitById } from '../../../data-access/commits'
import { assembleTraceWithMessages } from '../../tracing/traces/assemble'
import { adaptCompletionSpanMessagesToLegacy } from '../../tracing/spans/fetching/findCompletionSpanFromTrace'
import { Message } from '@latitude-data/constants/legacyCompiler'

/**
 * Builds a reason for an evaluation result, optionally generalizing it based on selected contexts.
 *
 * If the result has metadata with selected contexts, the initial reason from the evaluation
 * specification is generalized using a copilot to make it more context-aware. The enriched
 * reason is stored in the result metadata in the database to avoid redundant processing.
 * You should only use this method if you need the generalized reason of an evaluation result.
 *
 * Human annotations are generalized using a copilot to account for the fact
 * that humans will write poor annotations assuming the surrounding context will
 * be taken into account by our embedding model.
 *
 * @param result - The evaluation result to build a reason for
 * @param evaluation - The evaluation configuration that produced the result
 * @param transaction - Optional transaction instance to use for updates (useful when inside a transaction)
 * @returns A Result containing the reason string (initial or generalized)
 */
export async function getOrSetEnrichedReason<
  T extends EvaluationType,
  M extends EvaluationMetric<T>,
>({
  result,
  evaluation,
  transaction = new Transaction(),
}: {
  result: EvaluationResultV2<T, M>
  evaluation: EvaluationV2<T, M>
  transaction?: Transaction
}) {
  if (
    result.metadata &&
    'enrichedReason' in result.metadata &&
    result.metadata.enrichedReason
  ) {
    return Result.ok(result.metadata.enrichedReason)
  }

  const specification = getEvaluationMetricSpecification(evaluation)
  const initialReason = specification.resultReason(
    result as EvaluationResultSuccessValue<T, M>,
  )!

  // If there is no selected context no need to generalize
  if (!result.metadata || !('selectedContexts' in result.metadata)) {
    return Result.ok(initialReason)
  }
  if (
    !result.metadata.selectedContexts ||
    result.metadata.selectedContexts.length === 0
  ) {
    return Result.ok(initialReason)
  }

  // Get the evaluated span's trace to extract messages
  if (!result.evaluatedTraceId) {
    return Result.error(
      new BadRequestError('Evaluation result does not have a trace ID'),
    )
  }

  const workspace = await unsafelyFindWorkspace(result.workspaceId)
  const assembledTraceResult = await assembleTraceWithMessages({
    traceId: result.evaluatedTraceId,
    workspace,
  })
  if (!Result.isOk(assembledTraceResult)) {
    return Result.error(
      new BadRequestError('Cannot assemble trace for evaluation result'),
    )
  }

  const { completionSpan } = assembledTraceResult.unwrap()
  if (!completionSpan) {
    return Result.error(
      new BadRequestError('Cannot find completion span for evaluation result'),
    )
  }

  const messages = adaptCompletionSpanMessagesToLegacy(completionSpan)
  const context = JSON.stringify(result.metadata.selectedContexts)
  const enriching = await generalizeReason({
    reason: initialReason,
    messages,
    context,
  })
  if (!Result.isOk(enriching)) return enriching
  const enrichedReason = enriching.value

  // Update the result metadata in the database
  if (evaluation.type !== EvaluationType.Human) {
    return Result.error(
      new BadRequestError('Only human annotations can be enriched'),
    )
  }

  const updatedMetadata = {
    ...(result.metadata as HumanEvaluationResultMetadata),
    enrichedReason,
  } as HumanEvaluationResultMetadata

  return transaction.call(async (tx) => {
    const workspace = await unsafelyFindWorkspace(result.workspaceId, tx)
    const commit = await findCommitById(result.commitId, tx)

    // Create a transaction wrapper that reuses the same database connection
    const updateResult = await updateEvaluationResultV2(
      {
        workspace,
        commit,
        result: result as EvaluationResultV2<
          EvaluationType.Human,
          HumanEvaluationMetric
        >,
        evaluation: evaluation as EvaluationV2<
          EvaluationType.Human,
          HumanEvaluationMetric
        >,
        value: {
          metadata: updatedMetadata,
        },
      },
      transaction,
    )

    if (!Result.isOk(updateResult)) return updateResult

    return Result.ok(enrichedReason)
  })
}

async function generalizeReason({
  messages,
  reason,
  context,
}: {
  messages: Message[]
  reason: string
  context: string
}) {
  if (!env.COPILOT_PROMPT_ANNOTATION_GENERALIZER_PATH) {
    return Result.error(
      new Error('COPILOT_PROMPT_ANNOTATION_GENERALIZER_PATH is not set'),
    )
  }

  const copilot = await getCopilot({
    path: env.COPILOT_PROMPT_ANNOTATION_GENERALIZER_PATH,
  })
  if (!Result.isOk(copilot)) return Result.error(copilot.error!)

  const response = await runCopilot({
    copilot: copilot.value,
    parameters: {
      messages,
      annotation: reason,
      context: context,
    },
    schema: z.object({
      reasoning: z.string(),
      generalized_annotation: z.string(),
      error: z.string().optional(),
    }),
  })
  if (!Result.isOk(response)) return Result.error(response.error!)
  if (response.value.error !== undefined && response.value.error !== '') {
    return Result.error(new Error(response.value.error))
  }

  return Result.ok(response.value.generalized_annotation)
}
