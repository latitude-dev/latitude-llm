import { BadRequestError, type ProjectId } from "@domain/shared"
import { resolveTraceIdFromRef, traceRefSchema } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { persistDraftAnnotationInputSchema } from "../helpers/annotation-draft-write-schema.ts"
import { writeDraftAnnotationUseCase } from "./write-draft-annotation.ts"
import { writePublishedAnnotationUseCase } from "./write-published-annotation.ts"

/** The public annotations API always writes scores with `sourceId = "API"`. */
const PUBLIC_API_SOURCE_ID = "API" as const

/**
 * Public-API annotation submission payload.
 *
 * Reuses `persistDraftAnnotationInputSchema` for annotator-authored score
 * fields (value, passed, feedback, anchor, optional `id` for upsert) but
 * replaces the flat `traceId` with the `trace` discriminated union and adds
 * the `draft` opt-in (default `false` = publish immediately).
 *
 * Stripped from the accepted body:
 *   - `projectId` — comes from the URL.
 *   - `sourceId` — always forced to `"API"` by the use case below.
 *   - `traceId` — replaced by `trace` (id or filters).
 *   - `sessionId` / `spanId` — auto-resolved from the trace by
 *     `resolveWriteAnnotationTraceContext` (session lifted from the trace,
 *     span defaulted to the last LLM completion). Internal callers can still
 *     pass concrete values via the lower-level `writeDraftAnnotationUseCase`
 *     / `writePublishedAnnotationUseCase` primitives.
 */
export const submitApiAnnotationInputSchema = persistDraftAnnotationInputSchema
  .omit({ projectId: true, sourceId: true, sessionId: true, traceId: true, spanId: true })
  .extend({
    trace: traceRefSchema,
    draft: z.boolean().default(false),
  })

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

  const traceId = yield* resolveTraceIdFromRef(parsed.trace, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  })

  // sessionId/spanId are intentionally null so the downstream resolver lifts
  // the session from the trace and pins the annotation to the trace's last
  // LLM completion span — the public API doesn't accept overrides for these.
  const commonInput = {
    id: parsed.id,
    projectId: input.projectId,
    sourceId: PUBLIC_API_SOURCE_ID,
    sessionId: null,
    traceId,
    spanId: null,
    simulationId: parsed.simulationId,
    issueId: parsed.issueId,
    annotatorId: parsed.annotatorId,
    value: parsed.value,
    passed: parsed.passed,
    feedback: parsed.feedback,
    anchor: parsed.anchor,
    organizationId: input.organizationId,
  }

  return parsed.draft
    ? yield* writeDraftAnnotationUseCase(commonInput)
    : yield* writePublishedAnnotationUseCase(commonInput)
})
