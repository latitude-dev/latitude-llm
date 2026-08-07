import {
  AI,
  AI_GENERATE_TELEMETRY_SPAN_NAMES,
  AI_GENERATE_TELEMETRY_TAGS,
  type AICredentialError,
  type AIError,
  buildProjectScopedAiMetadata,
  resolveGenerationConfig,
} from "@domain/ai"
import { ScoreRepository, type ScoreSourceType } from "@domain/scores"
import { LATITUDE_TELEMETRY_PROJECT_SLUGS, ProjectId, type RepositoryError, SignalId } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import {
  SIGNAL_DETAILS_DEFAULT_GENERATION_MODEL,
  SIGNAL_DETAILS_MAX_OCCURRENCES,
  SIGNAL_NAME_MAX_LENGTH,
} from "../constants.ts"
import { type SignalPriority, signalPrioritySchema } from "../entities/signal.ts"
import {
  MissingSignalOccurrencesForDetailsGenerationError,
  SignalNotFoundForDetailsGenerationError,
} from "../errors.ts"
import { SignalRepository } from "../ports/signal-repository.ts"

const collapseWhitespace = (text: string) => text.replace(/\s+/g, " ").trim()

const truncateSignalName = (name: string) => {
  const collapsed = collapseWhitespace(name)
  if (collapsed.length <= 128) {
    return collapsed
  }

  return `${collapsed.slice(0, 125).trimEnd()}...`
}

const signalDetailsShape = {
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
}

const signalDetailsSchema = z.object(signalDetailsShape)

/**
 * `severity` is nullish on purpose: this same call produces the name and
 * description a signal cannot be created without, so a model that omits or
 * garbles the level must not fail signal creation. A missing level leaves the
 * signal unset, which the notification threshold always admits.
 */
const signalDetailsWithSeveritySchema = z.object({
  ...signalDetailsShape,
  severity: signalPrioritySchema.describe("How much attention this pattern deserves, per the severity rubric"),
})

export interface SignalOccurrenceInput {
  readonly sourceType: ScoreSourceType
  readonly feedback: string
  /** The score's own verdict, 0..1. Evidence the prose may not state. */
  readonly value?: number
  /** Slug of the flagger that authored this score, from `metadata.flaggerSlug`. */
  readonly flaggerSlug?: string
  /** A detector wrote this line, not a person. `sourceType` cannot say: flagger scores are annotations too. */
  readonly machineAuthored?: boolean
  /** Other detectors that matched the same session. Evidence the prose cannot carry. */
  readonly coOccurringDetectors?: readonly string[]
}

export interface GeneratedSignalDetails {
  readonly name: string
  readonly description: string
  /** Only present when `withSeverity` was requested and the model answered. */
  readonly severity?: SignalPriority
}

export interface GenerateSignalDetailsInput {
  readonly organizationId: string
  readonly projectId: string
  readonly signalId?: string | null
  readonly occurrences?: readonly SignalOccurrenceInput[]
  /**
   * Ask for a severity alongside the name and description. Creation-only: a
   * refresh must not re-derive it, or it would overwrite manual triage —
   * including a level a human deliberately cleared back to unset.
   */
  readonly withSeverity?: boolean
}

export type GenerateSignalDetailsError =
  | RepositoryError
  | AIError
  | AICredentialError
  | SignalNotFoundForDetailsGenerationError
  | MissingSignalOccurrencesForDetailsGenerationError

/**
 * Facts the feedback prose may not state: the numeric verdict and, for
 * flagger-authored scores, which detector matched. A detector slug says what
 * class of failure this is far more reliably than re-inferring it from a
 * sentence.
 */
const occurrenceTags = (occurrence: SignalOccurrenceInput): string => {
  const tags = [`source=${occurrence.sourceType}`]
  // `sourceType` is `annotation` for a detector's output as well as a person's,
  // so without this the prompt reads templated check output as hand-written.
  tags.push(`author=${occurrence.machineAuthored === true ? "detector" : "human"}`)
  if (occurrence.flaggerSlug !== undefined) tags.push(`detector=${occurrence.flaggerSlug}`)
  if (occurrence.coOccurringDetectors !== undefined && occurrence.coOccurringDetectors.length > 0) {
    tags.push(`alongside=${occurrence.coOccurringDetectors.join(",")}`)
  }
  // Only an evaluation produces a judged number. An annotation carries qualitative
  // text and a placeholder `0` — measured across every triaged signal in
  // production, all of them — so tagging it as a score would read to the model as
  // "judged as bad as possible", including on the ones describing good behaviour.
  if (occurrence.sourceType === "evaluation" && occurrence.value !== undefined) {
    tags.push(`score=${occurrence.value.toFixed(2)}`)
  }
  return tags.join(" ")
}

const buildOccurrenceBlock = (occurrences: readonly SignalOccurrenceInput[]) =>
  occurrences
    .map(
      (occurrence, index) => `${index + 1}. [${occurrenceTags(occurrence)}] ${collapseWhitespace(occurrence.feedback)}`,
    )
    .join("\n")

/**
 * Rates the failure mechanism the prose describes. Asking instead how much the
 * pattern should *interrupt* someone was tried and measurably lost: recall at a
 * `high` threshold fell from 8-9 of 11 wanted signals to 3, because a tier
 * defined by team workflow ("the next thing they pick up") is not answerable from
 * one sentence of user feedback, while a tier defined by what happened in the
 * conversation is exactly what that sentence describes. Ask a question the
 * evidence can answer.
 *
 * A signal is one occurrence old at creation — `createSignalFromScoreUseCase`
 * passes the single creating score — so there is no impact to measure yet and
 * ties resolve upward: this value gates notification delivery, and an over-rated
 * signal is noise where an under-rated one is never delivered and leaves no
 * trace. `recomputeSignalLevelUseCase` takes the level over from measurement
 * afterwards, which is what bounds the damage from rating it wrong here.
 */
export const SEVERITY_RUBRIC = [
  "Also return `severity`, rating how much attention this pattern deserves:",
  '- "urgent": data loss, a safety or compliance breach, leaked credentials or personal data — or a failure the caller cannot see and cannot recover from. An agent that stalls mid-task, loops on one call indefinitely, loses track of what it was doing, or reports success for work it did not do belongs here, because nothing downstream can tell that run from a finished one. Reserve this for silent or unrecoverable failures: if the user can see that it went wrong and retry, it is not urgent, however annoying it is.',
  '- "high": the task fails or the answer is wrong in a way the user would act on, but the failure is visible and the work can be redone. Refusing to do the work, doing it lazily, or producing an answer the user pushes back on lands here rather than in `urgent`.',
  '- "medium": the outcome is degraded — partial, inefficient, or needing rework — while the user can still get what they came for.',
  '- "low": cosmetic or stylistic only (tone, formatting, verbosity), or the pattern describes desirable behavior rather than a failure.',
  "Use the whole scale. Most patterns are not `medium` or `high`; those two are for genuinely middling cases, not a safe default when a case could be read either way. If the description fits `urgent` or `low`, answer that.",
  "Rate the mechanism itself, not how often it appears: a new pattern is typically a single occurrence, so frequency is not evidence yet. When the occurrences do not say enough to separate two levels, choose the higher one.",
  "Weigh the tags on each occurrence as evidence. `author=human` means a person stopped to write this up, which is itself weak evidence somebody cared; `author=detector` means a check emitted templated text and the wording carries no judgement about how much it matters. A `detector=` slug names the failure class that check matched. A `score=` tag, present only on evaluation-sourced occurrences, is the judge verdict where 0 is worst.",
  "An `alongside=` tag lists other detectors that matched the same conversation. Several independent checks firing on one session is evidence the run went badly in a way no single line of feedback shows, so let it raise your reading; its absence means nothing, because most sessions are only ever screened by one matching check.",
].join("\n")

const buildPrompt = (input: {
  readonly previousName: string | null
  readonly previousDescription: string | null
  readonly occurrences: readonly SignalOccurrenceInput[]
  readonly withSeverity: boolean
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
    input.withSeverity
      ? "Return JSON with `name`, `description` and `severity`."
      : "Return JSON with `name` and `description`.",
    "Rules:",
    "- If occurrences describe incompatible tools, transports, or error categories, use a title that preserves those distinctions; avoid vague umbrella labels that merge unrelated mechanisms.",
    "- Do not overfit to one conversation, one user, one date, or one exact example.",
    "- Prefer stable wording over churn when the current details already fit.",
    "- Keep `name` under 128 characters.",
    "- Keep `description` concise and focused on the shared underlying problem.",
    '- Frame `name` around the problem itself, not around the AI as the actor. Do not start it with "Agent", "The Agent", "Model", "The Model", "AI", "The AI", "Assistant", "The Assistant", "Bot", "The Bot", or any equivalent generic reference to the system being evaluated. Concrete subjects (specific tools, behaviors, outputs, or failure modes) are fine. Good examples: "Recommendation of dangerous product combinations", "Read tool fails accessing dataset rows", "Tool call failures due to missing dependencies, malformed input, or environment misconfiguration", "Unnecessary conversational filler undermines formal tone". Bad example: "Agent recommends dangerous product combinations".',
  )

  if (input.withSeverity) {
    parts.push(SEVERITY_RUBRIC)
  }

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
    const withSeverity = input.withSeverity === true

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
          sourceType: score.sourceType,
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
        // Spread, don't rebuild: the evidence tags (`value`, `flaggerSlug`) have to
        // survive normalization to reach the prompt.
        .map((occurrence) => ({ ...occurrence, feedback: collapseWhitespace(occurrence.feedback) }))
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
    const generate = <T>(schema: z.ZodType<T>, askForSeverity: boolean) =>
      ai.generate({
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
          withSeverity: askForSeverity,
        }),
        schema,
      })

    /**
     * `severity` is required, not optional. Offering the model a nullish field
     * makes null a legitimate answer and it takes it: measured over the eval
     * fixtures, an optional field came back unset 19 times out of 20, while the
     * required one answered every time. Robustness comes from this retry
     * instead — the same call produces the name and description a signal cannot
     * be created without, so a model that cannot satisfy the wider schema falls
     * back to the narrow one and the signal lands with no level.
     */
    const result = withSeverity
      ? yield* generate(signalDetailsWithSeveritySchema, true).pipe(
          Effect.catchCause(() => generate(signalDetailsSchema, false)),
        )
      : yield* generate(signalDetailsSchema, false)

    const severity = signalPrioritySchema.safeParse((result.object as { severity?: unknown }).severity)

    return {
      name: truncateSignalName(result.object.name),
      description: collapseWhitespace(result.object.description),
      ...(severity.success ? { severity: severity.data } : {}),
    } satisfies GeneratedSignalDetails
  }).pipe(Effect.withSpan("issues.generateSignalDetails")) as Effect.Effect<
    GeneratedSignalDetails,
    GenerateSignalDetailsError
  >
