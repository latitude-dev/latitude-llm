import { AI, type AICredentialError, type AIError } from "@domain/ai"
import { ScoreRepository, type ScoreSource } from "@domain/scores"
import { IssueId, ProjectId, type RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { ISSUE_DETAILS_GENERATION_MODEL, ISSUE_DETAILS_MAX_OCCURRENCES, ISSUE_NAME_MAX_LENGTH } from "../constants.ts"
import { IssueNotFoundForDetailsGenerationError, MissingIssueOccurrencesForDetailsGenerationError } from "../errors.ts"
import { IssueRepository } from "../ports/issue-repository.ts"

const collapseWhitespace = (text: string) => text.replace(/\s+/g, " ").trim()

const truncateIssueName = (name: string) => {
  const collapsed = collapseWhitespace(name)
  if (collapsed.length <= 128) {
    return collapsed
  }

  return `${collapsed.slice(0, 125).trimEnd()}...`
}

const issueDetailsSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(ISSUE_NAME_MAX_LENGTH)
    .describe("Short issue title that stays generic across similar failures"),
  description: z
    .string()
    .min(1)
    .describe("One concise paragraph describing the shared underlying problem across the occurrences"),
})

export interface IssueOccurrenceInput {
  readonly source: ScoreSource
  readonly feedback: string
}

export interface GeneratedIssueDetails {
  readonly name: string
  readonly description: string
}

export interface GenerateIssueDetailsInput {
  readonly projectId: string
  readonly issueId?: string | null
  readonly occurrences?: readonly IssueOccurrenceInput[]
}

export type GenerateIssueDetailsError =
  | RepositoryError
  | AIError
  | AICredentialError
  | IssueNotFoundForDetailsGenerationError
  | MissingIssueOccurrencesForDetailsGenerationError

const buildOccurrenceBlock = (occurrences: readonly IssueOccurrenceInput[]) =>
  occurrences
    .map(
      (occurrence, index) => `${index + 1}. [source=${occurrence.source}] ${collapseWhitespace(occurrence.feedback)}`,
    )
    .join("\n")

const buildPrompt = (input: {
  readonly previousName: string | null
  readonly previousDescription: string | null
  readonly occurrences: readonly IssueOccurrenceInput[]
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
    "- Keep the issue generic enough to group similar failures together.",
    "- Do not overfit to one conversation, one user, one date, or one exact example.",
    "- Prefer stable wording over churn when the current details already fit.",
    "- Keep `name` under 128 characters.",
    "- Keep `description` concise and focused on the shared underlying problem.",
  )

  return parts.join("\n\n")
}

const ISSUE_DETAILS_SYSTEM_PROMPT = `
You generate canonical issue names and descriptions for clustered reliability failures.

Your job is to summarize the shared underlying problem across several issue occurrences, not the incidental specifics of one occurrence.

You must:
- produce a stable, generic issue title and description
- focus on the recurring failure pattern
- avoid user-specific, trace-specific, or date-specific details
- keep the title short and searchable
- keep the description concise and human-readable
`.trim()

export const generateIssueDetailsUseCase = (input: GenerateIssueDetailsInput) =>
  Effect.gen(function* () {
    const ai = yield* AI

    let previousName: string | null = null
    let previousDescription: string | null = null
    let occurrences = input.occurrences ?? []

    if (input.issueId) {
      const issueRepository = yield* IssueRepository
      const scoreRepository = yield* ScoreRepository
      const issue = yield* issueRepository
        .findById(IssueId(input.issueId))
        .pipe(
          Effect.catchTag("NotFoundError", () =>
            Effect.fail(new IssueNotFoundForDetailsGenerationError({ issueId: String(input.issueId) })),
          ),
        )

      previousName = issue.name
      previousDescription = issue.description

      const recentScores = yield* scoreRepository.listByIssueId({
        projectId: ProjectId(input.projectId),
        issueId: issue.id,
        options: {
          limit: ISSUE_DETAILS_MAX_OCCURRENCES,
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
        } satisfies GeneratedIssueDetails
      }
    } else {
      occurrences = occurrences
        .map((occurrence) => ({
          source: occurrence.source,
          feedback: collapseWhitespace(occurrence.feedback),
        }))
        .filter((occurrence) => occurrence.feedback.length > 0)
        .slice(0, ISSUE_DETAILS_MAX_OCCURRENCES)

      if (occurrences.length === 0) {
        return yield* new MissingIssueOccurrencesForDetailsGenerationError({
          projectId: input.projectId,
        })
      }
    }

    const result = yield* ai.generate({
      ...ISSUE_DETAILS_GENERATION_MODEL,
      system: ISSUE_DETAILS_SYSTEM_PROMPT,
      prompt: buildPrompt({
        previousName,
        previousDescription,
        occurrences,
      }),
      schema: issueDetailsSchema,
    })

    return {
      name: truncateIssueName(result.object.name),
      description: collapseWhitespace(result.object.description),
    } satisfies GeneratedIssueDetails
  }) as Effect.Effect<GeneratedIssueDetails, GenerateIssueDetailsError>
