import {
  BadRequestError,
  generateId,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  type ScoreId,
  TraceId,
} from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { type RunFlaggerAnnotatorError, runFlaggerAnnotatorUseCase } from "./run-flagger-annotator.ts"

const formatValidationError = (error: z.ZodError): string => error.issues.map((issue) => issue.message).join(", ")

const draftFlaggerAnnotationInputSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  flaggerSlug: z.string().min(1),
  traceId: z.string().min(1),
  feedback: z.string().min(1).optional(),
  messageIndex: z.number().int().nonnegative().optional(),
})

const parseOrBadRequest = <T>(schema: z.ZodType<T>, input: unknown, message: string) =>
  Effect.try({
    try: () => schema.parse(input),
    catch: (error: unknown) =>
      new BadRequestError({
        message: error instanceof z.ZodError ? formatValidationError(error) : message,
      }),
  })

export interface DraftFlaggerAnnotationOutput {
  readonly traceId: string
  readonly feedback: string
  readonly traceCreatedAt: string
  readonly sessionId: string | null
  readonly simulationId: string | null
  readonly scoreId: ScoreId
  readonly messageIndex?: number | undefined
}

interface DraftFlaggerAnnotationInput {
  readonly organizationId: string
  readonly projectId: string
  readonly flaggerSlug: string
  readonly traceId: string
  readonly feedback?: string | undefined
  readonly messageIndex?: number | undefined
}

export type DraftFlaggerAnnotationError = BadRequestError | RepositoryError | RunFlaggerAnnotatorError

export const draftFlaggerAnnotationUseCase = Effect.fn("flaggers.draftFlaggerAnnotation")(function* (
  input: DraftFlaggerAnnotationInput,
) {
  yield* Effect.annotateCurrentSpan("flagger.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("flagger.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("flagger.traceId", input.traceId)
  yield* Effect.annotateCurrentSpan("flagger.flaggerSlug", input.flaggerSlug)

  const scoreId = generateId<"ScoreId">()

  const parsedInput = yield* parseOrBadRequest(
    draftFlaggerAnnotationInputSchema,
    input,
    "Invalid flagger annotate input",
  )

  if (parsedInput.feedback !== undefined) {
    const traceRepository = yield* TraceRepository
    const trace = yield* traceRepository.findByTraceId({
      organizationId: OrganizationId(parsedInput.organizationId),
      projectId: ProjectId(parsedInput.projectId),
      traceId: TraceId(parsedInput.traceId),
    })

    return {
      traceId: parsedInput.traceId,
      feedback: parsedInput.feedback,
      traceCreatedAt: trace.startTime.toISOString(),
      sessionId: trace.sessionId,
      simulationId: trace.simulationId === "" ? null : trace.simulationId,
      scoreId,
      messageIndex: parsedInput.messageIndex,
    } satisfies DraftFlaggerAnnotationOutput
  }

  const annotatorResult = yield* runFlaggerAnnotatorUseCase({
    organizationId: parsedInput.organizationId,
    projectId: parsedInput.projectId,
    flaggerSlug: parsedInput.flaggerSlug,
    traceId: parsedInput.traceId,
    scoreId,
  })

  return {
    traceId: parsedInput.traceId,
    feedback: annotatorResult.feedback,
    traceCreatedAt: annotatorResult.traceCreatedAt,
    sessionId: annotatorResult.sessionId,
    simulationId: annotatorResult.simulationId,
    scoreId,
    messageIndex: annotatorResult.messageIndex,
  } satisfies DraftFlaggerAnnotationOutput
})
