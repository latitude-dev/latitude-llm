import { appendFileSync } from "node:fs"
import { Effect } from "effect"

export interface DiscoverIssueInput {
  readonly organizationId: string
  readonly scoreId: string
}

export interface EligibilityResult {
  readonly eligible: boolean
  readonly scoreId: string
}

export const recheckEligibilityUseCase = (input: DiscoverIssueInput, logFile?: string) =>
  Effect.gen(function* () {
    yield* writeLog(
      logFile,
      `1/4 recheckEligibility: I am score ${input.scoreId}, checking if I'm eligible for discovery...`,
    )
    yield* Effect.sleep("500 millis")
    const result = { eligible: true, scoreId: input.scoreId } satisfies EligibilityResult
    yield* writeLog(
      logFile,
      `1/4 recheckEligibility: I am score ${input.scoreId}, verdict: eligible=${result.eligible}`,
    )
    return result
  })

export interface RetrievalResult {
  readonly matchedIssueId: string | null
  readonly similarityScore: number
}

export const retrieveAndRerankUseCase = (input: DiscoverIssueInput, logFile?: string) =>
  Effect.gen(function* () {
    yield* writeLog(
      logFile,
      `2/4 retrieveAndRerank: I am score ${input.scoreId}, searching Weaviate for similar issues...`,
    )
    yield* Effect.sleep("1 seconds")
    const result = { matchedIssueId: null, similarityScore: 0.2 } satisfies RetrievalResult
    yield* writeLog(
      logFile,
      `2/4 retrieveAndRerank: I am score ${input.scoreId}, found matchedIssueId=${result.matchedIssueId ?? "none"}, similarity=${result.similarityScore}`,
    )
    return result
  })

export interface AssignmentResult {
  readonly issueId: string
  readonly action: "created" | "assigned"
}

export const createOrAssignIssueUseCase = (
  input: {
    readonly organizationId: string
    readonly scoreId: string
    readonly matchedIssueId: string | null
  },
  logFile?: string,
) =>
  Effect.gen(function* () {
    const intent = input.matchedIssueId
      ? `assigning to existing issue ${input.matchedIssueId}`
      : "no match, creating new issue"
    yield* writeLog(logFile, `3/4 createOrAssignIssue: I am score ${input.scoreId}, ${intent}...`)
    yield* Effect.sleep("500 millis")
    const action = input.matchedIssueId ? ("assigned" as const) : ("created" as const)
    const issueId = input.matchedIssueId ?? `issue-${Date.now()}`
    yield* writeLog(
      logFile,
      `3/4 createOrAssignIssue: I am score ${input.scoreId}, result: action=${action}, issueId=${issueId}`,
    )
    return { issueId, action } satisfies AssignmentResult
  })

export const syncProjectionsUseCase = (
  input: { readonly organizationId: string; readonly issueId: string },
  logFile?: string,
) =>
  Effect.gen(function* () {
    yield* writeLog(
      logFile,
      `4/4 syncProjections: I am issue ${input.issueId}, syncing Weaviate centroid + ClickHouse analytics...`,
    )
    yield* Effect.sleep("500 millis")
    yield* writeLog(
      logFile,
      `4/4 syncProjections: I am issue ${input.issueId}, projections up to date. Discovery complete!`,
    )
  })

function writeLog(logFile: string | undefined, message: string) {
  return Effect.sync(() => {
    if (!logFile) return

    appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`)
  })
}
