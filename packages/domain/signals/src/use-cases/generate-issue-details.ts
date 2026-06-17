import {
  AI,
  AI_GENERATE_TELEMETRY_SPAN_NAMES,
  AI_GENERATE_TELEMETRY_TAGS,
  type AICredentialError,
  type AIError,
  buildProjectScopedAiMetadata,
  resolveGenerationConfig,
} from "@domain/ai"
import { ScoreRepository, type ScoreSource } from "@domain/scores"
import { SignalId, LATITUDE_TELEMETRY_PROJECT_SLUGS, ProjectId, type RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import {
  SIGNAL_DETAILS_DEFAULT_GENERATION_MODEL,
  SIGNAL_DETAILS_MAX_OCCURRENCES,
  SIGNAL_NAME_MAX_LENGTH,
} from "../constants.ts"
import { SignalNotFoundForDetailsGenerationError, MissingSignalOccurrencesForDetailsGenerationError } from "../errors.ts"
import { SignalRepository } from "../ports/issue-repository.ts"

const collapseWhitespace = (text: string) => text.replace(/\s+/g, " ").trim()

const truncateSignalName = (name: string) => {
  const collapsed = collapseWhitespace(name)
  if (collapsed.length <= 128) {
    return collapsed
  }

  return `${collapsed.slice(0, 125).trimEnd()}...`
}

const signalDetailsSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(SIGNAL_NAME_MAX_LENGTH)
    .describe(
      "Short issue title: stable across the same failure mechanism, but specific enough to separate incompatible mechanisms (e.g. different tools or error classes should not share a vague umbrella title)",
    ),
  description: z
    .string()
    .min(1)
    .describe("One concise paragraph describing the shared underlying problem across the occurrences"),
})

export interface SignalOccurrenceInput {
  readonly source: ScoreSource
  readonly feedback: string
}

export interface GeneratedSignalDetails {
  readonly name: string
  readonly description: string
}

export interface GenerateSignalDetailsInput {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId?: string | null
  readonly occurrences?: readonly SignalOccurrenceInput[]
}

export type GenerateSignalDetailsError =
  | RepositoryError
  | AIError
  | AICredentialError
  | SignalNotFoundForDetailsGenerationError
  | MissingSignalOccurrencesForDetailsGenerationError

const buildOccurrenceBlock = (occurrences: readonly SignalOccurrenceInput[]) =>
  occurrences
    .map(
      (occurrence, index) => `${index + 1}. [source=${occurrence.source}] ${collapseWhitespace(occurrence.feedback)}`,
    )
    .join("\n")

const buildPrompt = (input: {
  readonly previousName: string | null
  readonly previousDescription: string | null
  readonly occurrences: readonly SignalOccurrenceInput[]
}) => {
  const parts = ["Recent assigned issue occurrences (newest first):", buildOccurrenceBlock(input.occurrences)]

  if (input.previousName !== null && input.previousDescription !== null) {
    parts.push(
      "Current issue details (keep them unchanged when they already capture the same underlying pattern):",
      `Name: ${input.previousName}`,
      `Description: ${input.previousDescription}`,
    )
  }

  parts.push(
    "Return JSON with `name` and `description`.",
    "Rules:",
    "- If occurrences describe incompatible tools, transports, or error categories, use a title that preserves those distinctions; avoid vague umbrella labels that merge unrelated mechanisms.",
    "- Do not overfit to one conversation, one user, one date, or one exact example.",
    "- Prefer stable wording over churn when the current details already fit.",
    "- Keep `name` under 128 characters.",
    "- Keep `description` concise and focused on the shared underlying problem.",
    '- Frame `name` around the problem itself, not around the AI as the actor. Do not start it with "Agent", "The Agent", "Model", "The Model", "AI", "The AI", "Assistant", "The Assistant", "Bot", "The Bot", or any equivalent generic reference to the system being evaluated. Concrete subjects (specific tools, behaviors, outputs, or failure modes) are fine. Good examples: "Recommendation of dangerous product combinations", "Read tool fails accessing annotation queues data", "Tool call failures due to missing dependencies, malformed input, or environment misconfiguration", "Unnecessary conversational filler undermines formal tone". Bad example: "Agent recommends dangerous product combinations".',
  )

  return parts.join("\n\n")
}

const SIGNAL_DETAILS_SYSTEM_PROMPT = `
You generate canonical issue names and descriptions for clustered reliability failures.

Your job is to summarize the shared underlying problem across several issue occurrences, not the incidental specifics of one occurrence.

You must:
- produce a stable issue title and description that still separates incompatible failure mechanisms (different tools, error classes, or subsystems should not be flattened into one vague umbrella label)
- focus on the recurring failure pattern
- avoid user-specific, trace-specific, or date-specific details
- keep the title short and searchable
- keep the description concise and human-readable

Use the simplest wording that still carries the full meaning. Prefer short, everyday words over formal or technical synonyms when both fit, and keep both the title and description only as long as they need to be. The original context and nuance must still come through; simpler wording is the goal, not less information.
`.trim()

export const generateSignalDetailsUseCase = (input: GenerateSignalDetailsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", input.projectId)
    if (input.signalId) {
      yield* Effect.annotateCurrentSpan("signalId", input.signalId)
    }
    const ai = yield* AI

    let previousName: string | null = null
    let previousDescription: string | null = null
    let occurrences = input.occurrences ?? []

    if (input.signalId) {
      const signalRepository = yield* SignalRepository
      const scoreRepository = yield* ScoreRepository
      const issue = yield* signalRepository
        .findById(SignalId(input.signalId))
        .pipe(
          Effect.catchTag("NotFoundError", () =>
            Effect.fail(new SignalNotFoundForDetailsGenerationError({ signalId: String(input.signalId) })),
          ),
        )

      previousName = issue.name
      previousDescription = issue.description

      const recentScores = yield* scoreRepository.listBySignalId({
        projectId: ProjectId(input.projectId),
        signalId: issue.id,
        options: {
          limit: SIGNAL_DETAILS_MAX_OCCURRENCES,
        },
      })

      occurrences = recentScores.items
        .map((score) => ({
          source: score.source,
          feedback: score.feedback,
        }))
        .filter((occurrence) => collapseWhitespace(occurrence.feedback).length > 0)

      if (occurrences.length === 0) {
        return {
          name: issue.name,
          description: issue.description,
        } satisfies GeneratedSignalDetails
      }
    } else {
      occurrences = occurrences
        .map((occurrence) => ({
          source: occurrence.source,
          feedback: collapseWhitespace(occurrence.feedback),
        }))
        .filter((occurrence) => occurrence.feedback.length > 0)
        .slice(0, SIGNAL_DETAILS_MAX_OCCURRENCES)

      if (occurrences.length === 0) {
        return yield* new MissingSignalOccurrencesForDetailsGenerationError({
          projectId: input.projectId,
        })
      }
    }

    const modelConfig = yield* resolveGenerationConfig(
      "ISSUE_DETAILS_GENERATOR",
      SIGNAL_DETAILS_DEFAULT_GENERATION_MODEL,
    )
    const result = yield* ai.generate({
      ...modelConfig,
      telemetry: {
        spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.signalDetails,
        project: LATITUDE_TELEMETRY_PROJECT_SLUGS.signalDiscovery,
        tags: [...AI_GENERATE_TELEMETRY_TAGS.signalDetails],
        metadata: buildProjectScopedAiMetadata(
          { organizationId: input.organizationId, projectId: input.projectId },
          {
            ...(input.signalId ? { signalId: input.signalId } : {}),
            occurrenceCount: occurrences.length,
          },
        ),
      },
      system: SIGNAL_DETAILS_SYSTEM_PROMPT,
      prompt: buildPrompt({
        previousName,
        previousDescription,
        occurrences,
      }),
      schema: signalDetailsSchema,
    })

    return {
      name: truncateSignalName(result.object.name),
      description: collapseWhitespace(result.object.description),
    } satisfies GeneratedSignalDetails
  }).pipe(Effect.withSpan("issues.generateSignalDetails")) as Effect.Effect<
    GeneratedSignalDetails,
    GenerateSignalDetailsError
  >
