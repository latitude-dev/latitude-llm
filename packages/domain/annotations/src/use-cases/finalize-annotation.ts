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

export interface FinalizeAnnotationInput {
  readonly scoreId: ScoreId
}

export type FinalizeAnnotationError = RepositoryError | BadRequestError | AIError | AICredentialError

const ENRICHMENT_MODEL = { provider: "anthropic", model: "claude-haiku-4-5-20251001" } as const

const ENRICHMENT_SYSTEM_PROMPT = `You are a reliability annotation enrichment assistant. Your job is to transform raw human feedback about an LLM agent interaction into a concise, structured sentence suitable for clustering similar failure patterns.

Rules:
- Output exactly ONE sentence that describes the underlying failure pattern
- Be specific about what went wrong, not just that something was wrong
- Remove references to specific entities, dates, or details that are incidental to the failure pattern
- Keep the language neutral and descriptive
- The output must be useful for grouping similar failures together
- Do NOT include any preamble, explanation, or formatting — just the single enriched sentence

Examples:
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

  parts.push("\nEnrich the raw feedback into a single clusterable sentence:")

  return parts.join("\n")
}

export const finalizeAnnotationUseCase = (input: FinalizeAnnotationInput) =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const scoreRepository = yield* ScoreRepository
        const ai = yield* AI
        const outboxEventWriter = yield* OutboxEventWriter

        const score = yield* scoreRepository.findById(input.scoreId)

        if (!score) {
          return yield* new BadRequestError({ message: `Score ${input.scoreId} not found` })
        }

        // Idempotent: already finalized
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

        const result = yield* ai.generateText({
          ...ENRICHMENT_MODEL,
          system: ENRICHMENT_SYSTEM_PROMPT,
          prompt: buildEnrichmentPrompt(metadata),
          maxTokens: 256,
          temperature: 0.3,
        })

        const enrichedFeedback = result.text || metadata.rawFeedback // fallback to raw if empty

        const finalizedScore = {
          ...annotationScore,
          feedback: enrichedFeedback,
          duration: annotationScore.duration + result.duration,
          tokens: annotationScore.tokens + result.tokens,
          cost: annotationScore.cost,
          draftedAt: null, // clear draft state
          updatedAt: new Date(),
        }

        yield* scoreRepository.save(finalizedScore as AnnotationScore)

        if (isImmutableScore(finalizedScore as AnnotationScore)) {
          yield* outboxEventWriter
            .write({
              eventName: "ScoreImmutable",
              aggregateId: finalizedScore.id,
              organizationId: finalizedScore.organizationId,
              payload: {
                organizationId: finalizedScore.organizationId,
                projectId: finalizedScore.projectId,
                scoreId: finalizedScore.id,
                issueId: finalizedScore.issueId,
              },
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))
        }

        return finalizedScore as AnnotationScore
      }),
    )
  })
