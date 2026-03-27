import { AI, type AICredentialError, type AIError, formatGenAIMessagesForEnrichmentPrompt } from "@domain/ai"
import { type AnnotationScore, type AnnotationScoreMetadata, isImmutableScore, ScoreRepository } from "@domain/scores"
import {
  BadRequestError,
  OrganizationId,
  OutboxEventWriter,
  ProjectId,
  type RepositoryError,
  type ScoreId,
  SqlClient,
  TraceId,
  toRepositoryError,
} from "@domain/shared"
import { resolveLastLlmCompletionSpanId, SpanRepository, TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { resolveAnnotationAnchorText } from "../helpers/resolve-annotation-anchor-text.ts"

export interface PublishAnnotationInput {
  readonly scoreId: ScoreId
}

export type PublishAnnotationError = RepositoryError | BadRequestError | AIError | AICredentialError

const ENRICHMENT_MODEL = { provider: "openai", model: "gpt-5.4" } as const

const annotationPublicationEnrichmentSchema = z.object({
  reasoning: z
    .string()
    .describe("Brief rationale for how you distilled the raw feedback into the clusterable sentence"),
  enrichedSentence: z
    .string()
    .describe(
      "Exactly one sentence describing the underlying failure pattern, suitable for clustering similar failures",
    ),
})

const ENRICHMENT_SYSTEM_PROMPT = `You are a reliability annotation publication assistant. Your job is to transform raw human feedback about an LLM agent interaction into a concise, structured sentence suitable for clustering similar failure patterns.

You will receive the full canonical conversation when available, plus optional raw human feedback and an optional exact highlighted substring when the human selected specific text. Use the full conversation for context; the highlight alone is often too short to interpret (e.g. a single word). When there is no highlight, the feedback refers to the conversation as a whole.

You must respond as structured data with two fields: "reasoning" (why you chose the phrasing) and "enrichedSentence" (the single clusterable sentence).

Rules for enrichedSentence:
- Output exactly ONE sentence that describes the underlying failure pattern
- Be specific about what went wrong, not just that something was wrong
- Remove references to specific entities, dates, or details that are incidental to the failure pattern
- Keep the language neutral and descriptive
- The output must be useful for grouping similar failures together

Examples (enrichedSentence only — you still supply reasoning in your output):
- Raw: "this is wrong, the model hallucinated the date" → "Hallucinations of temporal information in the response"
- Raw: "it forgot my previous instructions" → "Earlier instructions were dropped and not applied in later turns"
- Raw: "the response is way too long and rambling" → "Excessively verbose and unfocused response"
- Raw: "good answer" → "Satisfactory and correct response to the request"`

const buildEnrichmentPrompt = (
  metadata: AnnotationScoreMetadata,
  options: {
    readonly fullConversationText: string | undefined
    readonly highlightedExcerpt: string | undefined
  },
): string => {
  const parts: string[] = []

  parts.push(`Raw human feedback: "${metadata.rawFeedback}"`)

  const conversation = options.fullConversationText?.trim()
  if (conversation) {
    parts.push(`Full conversation (canonical messages; primary context):\n${conversation}`)
  }

  const highlight = options.highlightedExcerpt?.trim()
  if (highlight) {
    parts.push(
      `Annotated text (exact substring the human selected within the conversation above; use together with the full conversation): "${highlight}"`,
    )
  }

  parts.push("\nProduce reasoning and enrichedSentence per the schema:")

  return parts.join("\n\n")
}

export const publishAnnotationUseCase = (input: PublishAnnotationInput) =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    const scoreRepository = yield* ScoreRepository
    const ai = yield* AI
    const outboxEventWriter = yield* OutboxEventWriter

    const score = yield* scoreRepository.findById(input.scoreId)

    if (!score) {
      return yield* new BadRequestError({ message: `Score ${input.scoreId} not found` })
    }

    // Idempotent: already published
    if (score.draftedAt === null) {
      return score as AnnotationScore
    }

    if (score.source !== "annotation") {
      return yield* new BadRequestError({
        message: `Score ${input.scoreId} is not an annotation (source: ${score.source})`,
      })
    }

    const annotationScore = score as AnnotationScore
    const metadata = annotationScore.metadata as AnnotationScoreMetadata

    let fullConversationText: string | undefined
    let highlightedExcerpt: string | undefined
    let resolvedSessionId = score.sessionId
    let resolvedSpanId = score.spanId

    if (score.traceId !== null) {
      const traceRepository = yield* TraceRepository
      const detail = yield* traceRepository.findByTraceId({
        organizationId: OrganizationId(score.organizationId),
        projectId: ProjectId(score.projectId),
        traceId: TraceId(score.traceId),
      })
      if (detail) {
        if (resolvedSessionId === null) {
          resolvedSessionId = detail.sessionId
        }
        if (resolvedSpanId === null) {
          const spanRepository = yield* SpanRepository
          const spans = yield* spanRepository.findByTraceId({
            organizationId: OrganizationId(score.organizationId),
            traceId: TraceId(score.traceId),
          })
          resolvedSpanId = resolveLastLlmCompletionSpanId(spans) ?? null
        }

        if (detail.allMessages.length > 0) {
          // Indexed blocks (not formatGenAIConversation): same 0-based order as metadata.messageIndex / anchors.
          fullConversationText = formatGenAIMessagesForEnrichmentPrompt(detail.allMessages)
          if (metadata.messageIndex !== undefined) {
            highlightedExcerpt = resolveAnnotationAnchorText(detail.allMessages, metadata)
          }
        }
      }
    }

    const result = yield* ai.generateObject({
      ...ENRICHMENT_MODEL,
      system: ENRICHMENT_SYSTEM_PROMPT,
      prompt: buildEnrichmentPrompt(metadata, { fullConversationText, highlightedExcerpt }),
      schema: annotationPublicationEnrichmentSchema,
      temperature: 1,
    })

    const enrichedFeedback = result.object.enrichedSentence.trim() || metadata.rawFeedback

    const publishedScore = {
      ...annotationScore,
      sessionId: resolvedSessionId,
      spanId: resolvedSpanId,
      feedback: enrichedFeedback,
      draftedAt: null, // clear draft state
      updatedAt: new Date(),
    }

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        yield* scoreRepository.save(publishedScore as AnnotationScore)

        if (isImmutableScore(publishedScore as AnnotationScore)) {
          yield* outboxEventWriter
            .write({
              eventName: "ScoreImmutable",
              aggregateId: publishedScore.id,
              aggregateType: "score",
              organizationId: publishedScore.organizationId,
              payload: {
                organizationId: publishedScore.organizationId,
                projectId: publishedScore.projectId,
                scoreId: publishedScore.id,
                issueId: publishedScore.issueId,
              },
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))
        }

        return publishedScore as AnnotationScore
      }),
    )
  })
