import { formatGenAIConversation } from "@domain/ai"
import { BadRequestError, IssueId, OrganizationId, ProjectId } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import type {
  CollectedEvaluationAlignmentExamples,
  HydratedEvaluationAlignmentExample,
} from "../../alignment/types.ts"
import {
  type EvaluationConversationMessage,
  toEvaluationConversationMessages,
} from "../../runtime/evaluation-execution.ts"
import type { EvaluationAlignmentExample } from "../../ports/evaluation-alignment-examples-repository.ts"
import { EvaluationAlignmentExamplesRepository } from "../../ports/evaluation-alignment-examples-repository.ts"
import { EvaluationIssueRepository } from "../../ports/evaluation-issue-repository.ts"

export const collectAlignmentExamplesUseCase = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string
  readonly createdAfter?: string | null
  readonly requirePositiveExamples?: boolean
}) =>
  Effect.gen(function* () {
    const issueRepository = yield* EvaluationIssueRepository
    const exampleRepository = yield* EvaluationAlignmentExamplesRepository
    const traceRepository = yield* TraceRepository
    const issueId = IssueId(input.issueId)
    const projectId = ProjectId(input.projectId)
    const issue = yield* issueRepository.findById(issueId)

    if (issue.projectId !== projectId) {
      return yield* new BadRequestError({
        message: `Issue ${input.issueId} does not belong to project ${input.projectId}`,
      })
    }

    const positiveExamples = yield* exampleRepository.listPositiveExamples({
      projectId,
      issueId,
      ...(input.createdAfter ? { createdAfter: new Date(input.createdAfter) } : {}),
    })

    if (positiveExamples.length === 0 && input.requirePositiveExamples !== false) {
      return yield* new BadRequestError({
        message: `Issue ${input.issueId} has no positive alignment examples yet`,
      })
    }

    const negativeExamples = yield* exampleRepository.listNegativeExamples({
      projectId,
      issueId,
      excludeTraceIds: positiveExamples.map((example) => example.traceId),
      ...(input.createdAfter ? { createdAfter: new Date(input.createdAfter) } : {}),
    })

    if (positiveExamples.length === 0 && negativeExamples.length === 0) {
      return {
        issueId: issue.id,
        issueName: issue.name,
        issueDescription: issue.description,
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
      issueId: issue.id,
      issueName: issue.name,
      issueDescription: issue.description,
      positiveExamples: positiveExamples.map(hydrateExample),
      negativeExamples: negativeExamples.map(hydrateExample),
    } satisfies CollectedEvaluationAlignmentExamples
  })
