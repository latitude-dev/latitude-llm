import {
  AI,
  AI_GENERATE_TELEMETRY_SPAN_NAMES,
  AI_GENERATE_TELEMETRY_TAGS,
  type AICredentialError,
  type AIError,
  buildProjectScopedAiMetadata,
  formatGenAIMessage,
} from "@domain/ai"
import type { AnnotationScoreMetadata } from "@domain/scores"
import {
  type BadRequestError,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  type ScoreId,
  TraceId,
} from "@domain/shared"
import { resolveLastLlmCompletionSpanId, SpanRepository, TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import type { GenAIMessage } from "rosetta-ai"
import { z } from "zod"
import { ANNOTATION_ENRICHMENT_MODEL } from "../constants.ts"
import { loadAnnotationScoreForPublicationMutation } from "../helpers/load-annotation-score-for-publication.ts"
import { resolveAnnotationAnchorText } from "../helpers/resolve-annotation-anchor-text.ts"

const annotationPublicationEnrichmentSchema = z.object({
  reasoning: z
    .string()
    .min(1)
    .describe("Brief rationale for how you distilled the raw feedback into the clusterable sentence"),
  enrichedFeedback: z
    .string()
    .min(1)
    .describe(
      "Exactly one sentence describing the underlying failure pattern, suitable for clustering similar failures",
    ),
})

const ENRICHMENT_SYSTEM_PROMPT = `
You are a reliability annotation publication assistant. Your job is to transform raw human feedback about an LLM agent interaction into a concise, structured sentence suitable for clustering similar failure patterns.

You will receive the full canonical conversation when available, plus optional raw human feedback and an optional exact highlighted substring when the human selected specific text. Use the full conversation for context; the highlight alone is often too short to interpret (e.g. a single word). When there is no highlight, the feedback refers to the conversation as a whole.

You must respond as structured data with two fields: \`reasoning\` (why you chose the phrasing) and \`enrichedFeedback\` (the single clusterable sentence).

Rules for \`enrichedFeedback\`:
- Output exactly ONE sentence that describes the underlying failure pattern
- Be specific about what went wrong, not just that something was wrong
- Remove references to specific entities, dates, or details that are incidental to the failure pattern
- Keep the language neutral and descriptive
- The output must be useful for grouping similar failures together
- Keep it short and use simple, plain words — avoid jargon, filler, and long phrasing

Examples (only \`enrichedFeedback\` — you still supply reasoning in your output):
- Raw: "this is wrong, the model hallucinated the date" → "Hallucinations of temporal information in the response"
- Raw: "it forgot my previous instructions" → "Instructions not being followed"
- Raw: "the response is way too long and rambling" → "Excessively verbose and unfocused response"
- Raw: "good answer" → "Satisfactory and correct response to the request"
`.trim()

const buildEnrichmentPrompt = (
  metadata: AnnotationScoreMetadata,
  options: {
    readonly fullConversationText: string | undefined
    readonly highlightedExcerpt: string | undefined
  },
): string => {
  const parts: string[] = []

  const conversation = options.fullConversationText?.trim()
  if (conversation) {
    parts.push(`Full conversation:\n${conversation}`)
  }

  const feedback = metadata.rawFeedback.trim()
  if (feedback) {
    parts.push(`Human feedback:\n${feedback}`)
  }

  const highlight = options.highlightedExcerpt?.trim()
  if (highlight) {
    parts.push(`Highlighted text:\n${highlight}`)
  }

  parts.push("Produce `reasoning` and `enrichedFeedback` per the schema:")

  return parts.join("\n\n")
}

/**
 * Like {@link formatGenAIConversation} but prefixes each turn with `[message i]` and uses `---` separators.
 * Use when the consumer must align text to **0-based indices** in canonical trace payloads (e.g.
 * `AnnotationScoreMetadata.messageIndex`, anchor resolution over `TraceDetail.allMessages`).
 * For a human-style transcript only, use {@link formatGenAIConversation} instead.
 */
export function formatGenAIMessagesForEnrichmentPrompt(messages: readonly GenAIMessage[]): string {
  const blocks: string[] = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const text = formatGenAIMessage(m)
    const body = text || "<no plain text in this message>"
    blocks.push(`[message ${i}] role=${m.role}\n${body}`)
  }
  return blocks.join("\n\n---\n\n")
}

export interface EnrichAnnotationForPublicationInput {
  readonly scoreId: ScoreId
}

export type EnrichAnnotationForPublicationResult =
  | { readonly status: "already-published" }
  | {
      readonly status: "enriched"
      readonly enrichedFeedback: string
      readonly resolvedSessionId: string | null
      readonly resolvedSpanId: string | null
    }

export type EnrichAnnotationForPublicationError = RepositoryError | BadRequestError | AIError | AICredentialError

export const enrichAnnotationForPublicationUseCase = Effect.fn("annotations.enrichAnnotationForPublication")(function* (
  input: EnrichAnnotationForPublicationInput,
) {
  yield* Effect.annotateCurrentSpan("annotation.scoreId", input.scoreId)
  const ai = yield* AI

  const loaded = yield* loadAnnotationScoreForPublicationMutation(input.scoreId)

  if (loaded.kind === "already-published") {
    return { status: "already-published" as const }
  }

  const annotationScore = loaded.score
  const metadata = annotationScore.metadata as AnnotationScoreMetadata

  let fullConversationText: string | undefined
  let highlightedExcerpt: string | undefined
  let resolvedSessionId = annotationScore.sessionId
  let resolvedSpanId = annotationScore.spanId

  if (annotationScore.traceId !== null) {
    const traceRepository = yield* TraceRepository
    const detail = yield* traceRepository
      .findByTraceId({
        organizationId: OrganizationId(annotationScore.organizationId),
        projectId: ProjectId(annotationScore.projectId),
        traceId: TraceId(annotationScore.traceId),
      })
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (detail) {
      if (resolvedSessionId === null) {
        resolvedSessionId = detail.sessionId
      }
      if (resolvedSpanId === null) {
        const spanRepository = yield* SpanRepository
        const spans = yield* spanRepository.listByTraceId({
          organizationId: OrganizationId(annotationScore.organizationId),
          traceId: TraceId(annotationScore.traceId),
        })
        resolvedSpanId = resolveLastLlmCompletionSpanId(spans) ?? null
      }

      if (detail.allMessages.length > 0) {
        fullConversationText = formatGenAIMessagesForEnrichmentPrompt(detail.allMessages)
        if (metadata.messageIndex !== undefined) {
          highlightedExcerpt = resolveAnnotationAnchorText(detail.allMessages, metadata)
        }
      }
    }
  }

  const result = yield* ai.generate({
    ...ANNOTATION_ENRICHMENT_MODEL,
    telemetry: {
      spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.annotationEnrichPublication,
      tags: [...AI_GENERATE_TELEMETRY_TAGS.annotationEnrichPublication],
      metadata: buildProjectScopedAiMetadata(
        {
          organizationId: annotationScore.organizationId,
          projectId: annotationScore.projectId,
        },
        {
          scoreId: input.scoreId,
          ...(annotationScore.traceId !== null ? { traceId: annotationScore.traceId } : {}),
        },
      ),
      ...(resolvedSessionId !== null ? { sessionId: resolvedSessionId } : {}),
    },
    system: ENRICHMENT_SYSTEM_PROMPT,
    prompt: buildEnrichmentPrompt(metadata, { fullConversationText, highlightedExcerpt }),
    schema: annotationPublicationEnrichmentSchema,
  })

  const enrichedFeedback = result.object.enrichedFeedback.trim() || metadata.rawFeedback

  return {
    status: "enriched" as const,
    enrichedFeedback,
    resolvedSessionId: resolvedSessionId === null ? null : String(resolvedSessionId),
    resolvedSpanId: resolvedSpanId === null ? null : String(resolvedSpanId),
  }
})
