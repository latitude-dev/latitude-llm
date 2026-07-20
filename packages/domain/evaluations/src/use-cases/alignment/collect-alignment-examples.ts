import { formatGenAIConversation } from "@domain/ai"
import { BadRequestError, OrganizationId, ProjectId, SignalId } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import type { CollectedEvaluationAlignmentExamples, HydratedEvaluationAlignmentExample } from "../../alignment/types.ts"
import type { EvaluationAlignmentExample } from "../../ports/evaluation-alignment-examples-repository.ts"
import {
  DEFAULT_ALIGNMENT_EXAMPLE_LIMIT,
  EvaluationAlignmentExamplesRepository,
} from "../../ports/evaluation-alignment-examples-repository.ts"
import { EvaluationSignalRepository } from "../../ports/evaluation-signal-repository.ts"
import {
  type EvaluationConversationMessage,
  toEvaluationConversationMessages,
} from "../../runtime/evaluation-execution.ts"

export const collectAlignmentExamplesUseCase = Effect.fn("evaluations.collectAlignmentExamples")(function* (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId: string
  readonly createdAfter?: string | null
  readonly requirePositiveExamples?: boolean
}) {
  yield* Effect.annotateCurrentSpan("evaluation.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("evaluation.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("evaluation.signalId", input.signalId)

  const signalRepository = yield* EvaluationSignalRepository
  const exampleRepository = yield* EvaluationAlignmentExamplesRepository
  const traceRepository = yield* TraceRepository
  const signalId = SignalId(input.signalId)
  const projectId = ProjectId(input.projectId)
  const issue = yield* signalRepository.findById(signalId)

  if (issue.projectId !== projectId) {
    return yield* new BadRequestError({
      message: `Signal ${input.signalId} does not belong to project ${input.projectId}`,
    })
  }

  // Single budget for the curated set (repository defaults apply per list). We aim for a
  // balanced split: up to MAX/2 positives and MAX/2 negatives, then backfill shortfalls from
  // the other label until we hit the total cap or run out of examples.
  const maxExamples = DEFAULT_ALIGNMENT_EXAMPLE_LIMIT
  const balancedHalf = Math.floor(maxExamples / 2)
  const createdAfter = input.createdAfter ? { createdAfter: new Date(input.createdAfter) } : {}

  let positiveExamples = yield* exampleRepository.listPositiveExamples({
    projectId,
    signalId,
    limit: balancedHalf,
    ...createdAfter,
  })

  if (positiveExamples.length === 0 && input.requirePositiveExamples !== false) {
    return yield* new BadRequestError({
      message: "At least 1 of the signal's traces must be annotated by a human before an evaluation can be generated.",
    })
  }

  let negativeExamples = yield* exampleRepository.listNegativeExamples({
    projectId,
    signalId,
    excludeTraceIds: positiveExamples.map((example) => example.traceId),
    limit: balancedHalf,
    ...createdAfter,
  })

  let remaining = maxExamples - positiveExamples.length - negativeExamples.length

  while (remaining > 0) {
    const beforePositiveCount = positiveExamples.length
    const beforeNegativeCount = negativeExamples.length

    if (positiveExamples.length < balancedHalf) {
      const need = Math.min(remaining, balancedHalf - positiveExamples.length)
      const extended = yield* exampleRepository.listNegativeExamples({
        projectId,
        signalId,
        excludeTraceIds: positiveExamples.map((example) => example.traceId),
        limit: negativeExamples.length + need,
        ...createdAfter,
      })
      const additional = extended.slice(negativeExamples.length, negativeExamples.length + need)
      if (additional.length > 0) {
        negativeExamples = [...negativeExamples, ...additional]
      }
    }

    remaining = maxExamples - positiveExamples.length - negativeExamples.length
    if (remaining <= 0) {
      break
    }

    if (negativeExamples.length < balancedHalf) {
      const need = Math.min(remaining, balancedHalf - negativeExamples.length)
      const extended = yield* exampleRepository.listPositiveExamples({
        projectId,
        signalId,
        limit: positiveExamples.length + need,
        ...createdAfter,
      })
      const additional = extended.slice(positiveExamples.length, positiveExamples.length + need)
      if (additional.length > 0) {
        positiveExamples = [...positiveExamples, ...additional]
      }
    }

    remaining = maxExamples - positiveExamples.length - negativeExamples.length
    if (remaining <= 0) {
      break
    }

    if (positiveExamples.length >= balancedHalf && negativeExamples.length >= balancedHalf) {
      const need = remaining
      const extendedNeg = yield* exampleRepository.listNegativeExamples({
        projectId,
        signalId,
        excludeTraceIds: positiveExamples.map((example) => example.traceId),
        limit: negativeExamples.length + need,
        ...createdAfter,
      })
      const additionalNeg = extendedNeg.slice(negativeExamples.length, negativeExamples.length + need)
      if (additionalNeg.length > 0) {
        negativeExamples = [...negativeExamples, ...additionalNeg]
      }

      remaining = maxExamples - positiveExamples.length - negativeExamples.length
      if (remaining <= 0) {
        break
      }

      const extendedPos = yield* exampleRepository.listPositiveExamples({
        projectId,
        signalId,
        limit: positiveExamples.length + remaining,
        ...createdAfter,
      })
      const additionalPos = extendedPos.slice(positiveExamples.length, positiveExamples.length + remaining)
      if (additionalPos.length > 0) {
        positiveExamples = [...positiveExamples, ...additionalPos]
      }
    }

    remaining = maxExamples - positiveExamples.length - negativeExamples.length
    const madeProgress =
      positiveExamples.length !== beforePositiveCount || negativeExamples.length !== beforeNegativeCount
    if (!madeProgress) {
      break
    }
  }

  if (positiveExamples.length === 0 && negativeExamples.length === 0) {
    return {
      signalId: issue.id,
      signalName: issue.name,
      signalDescription: issue.description,
      positiveExamples: [],
      negativeExamples: [],
    } satisfies CollectedEvaluationAlignmentExamples
  }

  const traceDetails = yield* traceRepository.listByTraceIds({
    organizationId: OrganizationId(input.organizationId),
    projectId,
    traceIds: [...new Set([...positiveExamples, ...negativeExamples].map((example) => example.traceId))],
  })

  const traceDetailsById = new Map(traceDetails.map((detail) => [detail.traceId as string, detail]))

  const hydrateExample = (example: EvaluationAlignmentExample): HydratedEvaluationAlignmentExample => {
    const detail = traceDetailsById.get(example.traceId as string)

    if (!detail) {
      throw new BadRequestError({
        message: `Trace ${example.traceId} was not found for alignment example hydration`,
      })
    }

    const conversation: readonly EvaluationConversationMessage[] = toEvaluationConversationMessages(detail.allMessages)

    return {
      ...example,
      conversation,
      conversationText: formatGenAIConversation(detail.allMessages),
    }
  }

  return {
    signalId: issue.id,
    signalName: issue.name,
    signalDescription: issue.description,
    positiveExamples: positiveExamples.map(hydrateExample),
    negativeExamples: negativeExamples.map(hydrateExample),
  } satisfies CollectedEvaluationAlignmentExamples
})
