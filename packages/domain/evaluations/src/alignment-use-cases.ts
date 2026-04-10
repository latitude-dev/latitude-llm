import { formatGenAIConversation } from "@domain/ai"
import { hashOptimizationCandidateText } from "@domain/optimizations"
import { BadRequestError, EvaluationId, generateId, IssueId, OrganizationId, ProjectId } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { evaluateDraftAgainstExamplesUseCase } from "./alignment-execution.ts"
import type {
  BaselineEvaluationResult,
  CollectedEvaluationAlignmentExamples,
  EvaluationAlignmentConversationMessage,
  GeneratedEvaluationDraft,
  HydratedEvaluationAlignmentExample,
  IncrementalEvaluationRefreshResult,
  LoadedEvaluationAlignmentState,
  PersistEvaluationAlignmentResult,
} from "./alignment-types.ts"
import { generateBaselinePromptText, wrapPromptAsScript } from "./baseline-generation.ts"
import {
  type ConfusionMatrix,
  defaultEvaluationTrigger,
  type EvaluationTrigger,
  evaluationSchema,
} from "./entities/evaluation.ts"
import {
  decideAlignmentRefreshStrategy,
  deriveEvaluationAlignmentMetrics,
  emptyConfusionMatrix,
  isDeletedEvaluation,
  toAlignmentConversationMessages,
} from "./helpers.ts"
import type { EvaluationAlignmentExample } from "./ports/evaluation-alignment-examples-repository.ts"
import { EvaluationAlignmentExamplesRepository } from "./ports/evaluation-alignment-examples-repository.ts"
import { EvaluationIssueRepository } from "./ports/evaluation-issue-repository.ts"
import { EvaluationRepository } from "./ports/evaluation-repository.ts"

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

      const conversation: readonly EvaluationAlignmentConversationMessage[] = toAlignmentConversationMessages(
        detail.allMessages,
      )

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

export const loadAlignmentStateUseCase = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string
  readonly evaluationId: string
}) =>
  Effect.gen(function* () {
    const evaluationRepository = yield* EvaluationRepository
    const issueRepository = yield* EvaluationIssueRepository
    const evaluation = yield* evaluationRepository
      .findById(EvaluationId(input.evaluationId))
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    if (evaluation === null) {
      return yield* new BadRequestError({
        message: `Evaluation ${input.evaluationId} was not found for alignment`,
      })
    }

    if (isDeletedEvaluation(evaluation)) {
      return yield* new BadRequestError({
        message: `Deleted evaluation ${evaluation.id} cannot be realigned`,
      })
    }

    if (evaluation.projectId !== ProjectId(input.projectId) || evaluation.issueId !== IssueId(input.issueId)) {
      return yield* new BadRequestError({
        message: `Evaluation ${evaluation.id} does not match the requested issue or project`,
      })
    }

    const issue = yield* issueRepository.findById(IssueId(input.issueId))

    return {
      evaluationId: evaluation.id,
      issueId: evaluation.issueId,
      issueName: issue.name,
      issueDescription: issue.description,
      name: evaluation.name,
      description: evaluation.description,
      alignedAt: evaluation.alignedAt.toISOString(),
      draft: {
        script: evaluation.script,
        evaluationHash: evaluation.alignment.evaluationHash,
        trigger: evaluation.trigger,
      },
      confusionMatrix: evaluation.alignment.confusionMatrix,
    } satisfies LoadedEvaluationAlignmentState
  })

export const persistAlignmentResultUseCase = (input: {
  readonly organizationId: string
  readonly projectId: string
  readonly issueId: string
  readonly evaluationId?: string | null
  readonly script: string
  readonly evaluationHash: string
  readonly confusionMatrix: ConfusionMatrix
  readonly trigger: EvaluationTrigger
  readonly name: string
  readonly description: string
}) =>
  Effect.gen(function* () {
    const evaluationRepository = yield* EvaluationRepository
    const projectId = ProjectId(input.projectId)
    const issueId = IssueId(input.issueId)
    const existingEvaluation = input.evaluationId
      ? yield* evaluationRepository
          .findById(EvaluationId(input.evaluationId))
          .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
      : null

    if (input.evaluationId && existingEvaluation === null) {
      return yield* new BadRequestError({
        message: `Evaluation ${input.evaluationId} was not found for alignment`,
      })
    }

    if (existingEvaluation && isDeletedEvaluation(existingEvaluation)) {
      return yield* new BadRequestError({
        message: `Deleted evaluation ${existingEvaluation.id} cannot be realigned`,
      })
    }

    if (existingEvaluation && (existingEvaluation.projectId !== projectId || existingEvaluation.issueId !== issueId)) {
      return yield* new BadRequestError({
        message: `Evaluation ${existingEvaluation.id} does not match the requested issue or project`,
      })
    }

    const now = new Date()
    const evaluation = evaluationSchema.parse({
      id: existingEvaluation?.id ?? input.evaluationId ?? generateId(),
      organizationId: input.organizationId,
      projectId: input.projectId,
      issueId: input.issueId,
      name: existingEvaluation?.name ?? input.name,
      description: existingEvaluation?.description ?? input.description,
      script: input.script,
      trigger: input.trigger,
      alignment: {
        evaluationHash: input.evaluationHash,
        confusionMatrix: input.confusionMatrix,
      },
      alignedAt: now,
      archivedAt: existingEvaluation?.archivedAt ?? null,
      deletedAt: existingEvaluation?.deletedAt ?? null,
      createdAt: existingEvaluation?.createdAt ?? now,
      updatedAt: now,
    })

    yield* evaluationRepository.save(evaluation)

    return { evaluationId: evaluation.id } satisfies PersistEvaluationAlignmentResult
  })

// TODO(eval-sandbox): restore LLM-based baseline generation for arbitrary scripts when sandbox
// is available.
export const generateBaselineDraftUseCase = (input: {
  readonly issueName: string
  readonly issueDescription: string
}) =>
  Effect.gen(function* () {
    const promptText = generateBaselinePromptText(input.issueName, input.issueDescription)
    const script = wrapPromptAsScript(promptText)

    return {
      script,
      evaluationHash: yield* Effect.tryPromise(() => hashOptimizationCandidateText(script)),
      trigger: defaultEvaluationTrigger(),
    } satisfies GeneratedEvaluationDraft
  })

export const evaluateBaselineDraftUseCase = (input: {
  readonly issueName: string
  readonly issueDescription: string
  readonly script: string
  readonly positiveExamples: readonly HydratedEvaluationAlignmentExample[]
  readonly negativeExamples: readonly HydratedEvaluationAlignmentExample[]
}) =>
  evaluateDraftAgainstExamplesUseCase({
    issueName: input.issueName,
    issueDescription: input.issueDescription,
    script: input.script,
    positiveExamples: input.positiveExamples,
    negativeExamples: input.negativeExamples,
  })

export const evaluateIncrementalDraftUseCase = (input: {
  readonly issueName: string
  readonly issueDescription: string
  readonly draft: GeneratedEvaluationDraft
  readonly previousConfusionMatrix: ConfusionMatrix
  readonly positiveExamples: readonly HydratedEvaluationAlignmentExample[]
  readonly negativeExamples: readonly HydratedEvaluationAlignmentExample[]
}) =>
  Effect.gen(function* () {
    const newExampleCount = input.positiveExamples.length + input.negativeExamples.length
    const previousMetrics = deriveEvaluationAlignmentMetrics(input.previousConfusionMatrix)

    if (newExampleCount === 0) {
      return {
        strategy: "no-op",
        previousConfusionMatrix: input.previousConfusionMatrix,
        incrementalConfusionMatrix: emptyConfusionMatrix(),
        nextConfusionMatrix: input.previousConfusionMatrix,
        metrics: previousMetrics,
        exampleResults: [],
        newExampleCount,
        previousMetrics,
        previousMatthewsCorrelationCoefficient: previousMetrics.matthewsCorrelationCoefficient,
        nextMatthewsCorrelationCoefficient: previousMetrics.matthewsCorrelationCoefficient,
        matthewsCorrelationCoefficientDrop: 0,
        confusionMatrix: emptyConfusionMatrix(),
      } satisfies IncrementalEvaluationRefreshResult
    }

    const incremental: BaselineEvaluationResult = yield* evaluateDraftAgainstExamplesUseCase({
      issueName: input.issueName,
      issueDescription: input.issueDescription,
      script: input.draft.script,
      positiveExamples: input.positiveExamples,
      negativeExamples: input.negativeExamples,
    })

    const decision = decideAlignmentRefreshStrategy({
      previousConfusionMatrix: input.previousConfusionMatrix,
      incrementalConfusionMatrix: incremental.confusionMatrix,
    })

    return {
      strategy: decision.strategy,
      previousConfusionMatrix: input.previousConfusionMatrix,
      incrementalConfusionMatrix: incremental.confusionMatrix,
      nextConfusionMatrix: decision.nextConfusionMatrix,
      metrics: deriveEvaluationAlignmentMetrics(decision.nextConfusionMatrix),
      exampleResults: incremental.exampleResults,
      newExampleCount,
      previousMetrics,
      previousMatthewsCorrelationCoefficient: decision.previousMatthewsCorrelationCoefficient,
      nextMatthewsCorrelationCoefficient: decision.nextMatthewsCorrelationCoefficient,
      matthewsCorrelationCoefficientDrop: decision.matthewsCorrelationCoefficientDrop,
      confusionMatrix: incremental.confusionMatrix,
    } satisfies IncrementalEvaluationRefreshResult
  })
