import { BadRequestError, NotFoundError, OrganizationId, type ProjectId, TraceId } from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { submitApiAnnotationInputSchema, type TraceRef } from "../helpers/annotation-public-api-schema.ts"
import { writeDraftAnnotationUseCase } from "./write-draft-annotation.ts"
import { writePublishedAnnotationUseCase } from "./write-published-annotation.ts"

/** The public annotations API always writes scores with `sourceId = "API"`. */
const PUBLIC_API_SOURCE_ID = "API" as const

const formatValidationError = (error: z.ZodError): string => error.issues.map((issue) => issue.message).join(", ")

const parseOrBadRequest = <T>(schema: z.ZodType<T>, input: unknown, fallbackMessage: string) =>
  Effect.try({
    try: () => schema.parse(input),
    catch: (error: unknown) =>
      new BadRequestError({
        message: error instanceof z.ZodError ? formatValidationError(error) : fallbackMessage,
      }),
  })

interface SubmitApiAnnotationContext {
  readonly organizationId: string
  readonly projectId: ProjectId
}

type SubmitApiAnnotationRequest = z.input<typeof submitApiAnnotationInputSchema> & SubmitApiAnnotationContext

const resolveTraceId = (trace: TraceRef, ctx: SubmitApiAnnotationContext) =>
  Effect.gen(function* () {
    const traceRepository = yield* TraceRepository
    const organizationId = OrganizationId(ctx.organizationId)

    if (trace.by === "id") {
      // Verify the trace exists within this organization + project before
      // trusting the caller-supplied id. Without this, a caller could write an
      // annotation against any traceId — including one owned by a different
      // tenant. `matchesFiltersByTraceId` with no filters is a cheap scoped
      // existence check (one count query).
      const traceId = TraceId(trace.id)
      const belongsToProject = yield* traceRepository.matchesFiltersByTraceId({
        organizationId,
        projectId: ctx.projectId,
        traceId,
      })
      if (!belongsToProject) {
        return yield* new NotFoundError({ entity: "Trace", id: trace.id })
      }
      return traceId
    }

    const page = yield* traceRepository.listByProjectId({
      organizationId,
      projectId: ctx.projectId,
      options: { filters: trace.filters, limit: 2 },
    })

    if (page.items.length > 1) {
      return yield* new BadRequestError({
        message:
          "Trace filter matched more than one trace in this project. Refine the filter set so it identifies exactly one trace.",
      })
    }

    const [match] = page.items
    if (match === undefined) {
      return yield* new NotFoundError({
        entity: "Trace",
        id: "No trace in this project matches the provided filters",
      })
    }

    return match.traceId
  })

/**
 * Public-API entry point for creating an annotation.
 *
 * Resolves the target trace (by id or by filter set) and then branches on the
 * caller-provided `draft` flag:
 *
 * - `draft: false` (default) → `writePublishedAnnotationUseCase` (writes with
 *   `draftedAt = null` and emits `ScoreCreated` with `status: "published"` in
 *   the same transaction, so the annotation enters issue discovery immediately).
 * - `draft: true` → `writeDraftAnnotationUseCase` (writes with `draftedAt` set;
 *   publication is later driven by the debounced `annotation-scores:publish`
 *   task path used by the managed UI).
 *
 * `sourceId` is always forced to `"API"` for this entry point; the lower-level
 * `writeDraftAnnotationUseCase` / `writePublishedAnnotationUseCase` primitives
 * remain for internal callers that already have a resolved trace id and a
 * different source.
 */
export const submitApiAnnotationUseCase = Effect.fn("annotations.submitApiAnnotation")(function* (
  input: SubmitApiAnnotationRequest,
) {
  // Parse before reading any field off the payload: a malformed body (missing
  // `trace`, non-object, etc.) must bubble up as a BadRequestError -> 400,
  // never as an uncaught TypeError -> 500.
  const parsed = yield* parseOrBadRequest(
    submitApiAnnotationInputSchema,
    input,
    "Invalid annotation submission payload",
  )

  const traceId = yield* resolveTraceId(parsed.trace, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  })

  const commonInput = {
    id: parsed.id,
    projectId: input.projectId,
    sourceId: PUBLIC_API_SOURCE_ID,
    sessionId: parsed.sessionId,
    traceId,
    spanId: parsed.spanId,
    simulationId: parsed.simulationId,
    issueId: parsed.issueId,
    annotatorId: parsed.annotatorId,
    value: parsed.value,
    passed: parsed.passed,
    feedback: parsed.feedback,
    messageIndex: parsed.messageIndex,
    partIndex: parsed.partIndex,
    startOffset: parsed.startOffset,
    endOffset: parsed.endOffset,
    anchor: parsed.anchor,
    organizationId: input.organizationId,
  }

  return parsed.draft
    ? yield* writeDraftAnnotationUseCase(commonInput)
    : yield* writePublishedAnnotationUseCase(commonInput)
})
