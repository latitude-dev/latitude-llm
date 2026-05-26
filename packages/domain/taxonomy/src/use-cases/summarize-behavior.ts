import { AI } from "@domain/ai"
import { Effect } from "effect"
import { z } from "zod"
import { TAXONOMY_SUMMARY_MODEL } from "../constants.ts"

export const behaviorSummarySchema = z.object({
  summary: z
    .string()
    .min(20)
    .max(280)
    .describe(
      "One sentence capturing what the user was trying to do and what the agent did. Generic, not memorizing facts.",
    ),
  primaryActor: z.enum(["user", "agent", "both"]).describe("Whose behavior the summary primarily describes."),
  intentTags: z.array(z.string()).max(4).describe("Up to four short topical tags (lowercase, kebab-case)."),
})

export type BehaviorSummary = z.infer<typeof behaviorSummarySchema>

export interface SummarizeBehaviorInput {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly conversationText: string
}

export const summarizeBehaviorUseCase = (input: SummarizeBehaviorInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.sessionId", input.sessionId)
    const ai = yield* AI

    const result = yield* ai.generate({
      provider: TAXONOMY_SUMMARY_MODEL.provider,
      model: TAXONOMY_SUMMARY_MODEL.model,
      reasoning: "none",
      temperature: 0.2,
      maxTokens: 320,
      schema: behaviorSummarySchema,
      system:
        "You label behavior in LLM conversations. Return one generic sentence about what the user tried to do and what the agent did. Do not memorize proper nouns, secrets, or incidental facts.",
      prompt: `Session ${input.sessionId}:\n\n${input.conversationText}`,
      telemetry: {
        spanName: "taxonomy.summarizeBehavior",
        tags: ["taxonomy", "summary"],
        metadata: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          sessionId: input.sessionId,
        },
      },
    })

    return result.object
  }).pipe(Effect.withSpan("taxonomy.summarizeBehavior"))
