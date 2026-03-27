import { AI, type AICredentialError, type AIError } from "@domain/ai"
import { type AnnotationScore, type AnnotationScoreMetadata, isImmutableScore, ScoreRepository } from "@domain/scores"
import {
  BadRequestError,
  OutboxEventWriter,
  type RepositoryError,
  type ScoreId,
  SqlClient,
  toRepositoryError,
} from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"

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

You must respond as structured data with two fields: "reasoning" (why you chose the phrasing) and "enrichedSentence" (the single clusterable sentence).

Rules for enrichedSentence:
- Output exactly ONE sentence that describes the underlying failure pattern
- Be specific about what went wrong, not just that something was wrong
- Remove references to specific entities, dates, or details that are incidental to the failure pattern
- Keep the language neutral and descriptive
- The output must be useful for grouping similar failures together

Examples (enrichedSentence only — you still supply reasoning in your output):
- Raw: "this is wrong, the model hallucinated the date" → "Model hallucinated temporal information in the response"
- Raw: "it forgot my previous instructions" → "Model failed to maintain context from earlier instructions in the conversation"
- Raw: "the response is way too long and rambling" → "Model produced an excessively verbose and unfocused response"
- Raw: "good answer" → "Model provided a satisfactory and correct response"`

const buildEnrichmentPrompt = (metadata: AnnotationScoreMetadata): string => {
  const parts: string[] = []

  parts.push(`Raw human feedback: "${metadata.rawFeedback}"`)

  if (metadata.messageIndex !== undefined) {
    parts.push(`Annotated message index: ${metadata.messageIndex}`)
  }
  if (metadata.partIndex !== undefined) {
    parts.push(`Annotated part index: ${metadata.partIndex}`)
  }
  if (metadata.startOffset !== undefined && metadata.endOffset !== undefined) {
    parts.push(`Annotated text range: ${metadata.startOffset}-${metadata.endOffset}`)
  }

  parts.push("\nProduce reasoning and enrichedSentence per the schema:")

  return parts.join("\n")
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

    const result = yield* ai.generateObject({
      ...ENRICHMENT_MODEL,
      system: ENRICHMENT_SYSTEM_PROMPT,
      prompt: buildEnrichmentPrompt(metadata),
      schema: annotationPublicationEnrichmentSchema,
      temperature: 1,
    })

    const enrichedFeedback = result.object.enrichedSentence.trim() || metadata.rawFeedback

    const publishedScore = {
      ...annotationScore,
      feedback: enrichedFeedback,
      duration: annotationScore.duration + result.duration,
      tokens: annotationScore.tokens + result.tokens,
      cost: annotationScore.cost,
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
