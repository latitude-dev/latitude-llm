import { ScoreAnalyticsRepository } from "@domain/scores"
import type { ChSqlClient, ExternalUserId, OrganizationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Issue, IssueState } from "../entities/issue.ts"
import { deriveIssueLifecycleStates } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"

export interface ListUserIssuesInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly userId: ExternalUserId
  readonly limit?: number
}

export interface UserIssueItem {
  readonly issue: Issue
  readonly states: readonly IssueState[]
  readonly occurrences: number
  /** Distinct traces of the user that contributed an occurrence. */
  readonly affectedTraces: number
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
}

export type ListUserIssuesError = RepositoryError

/**
 * Issues that occurred on the given end-user's traces, ordered by most recent
 * occurrence first. Occurrence counts are user-scoped (only scores on the
 * user's traces), while the issue rows and lifecycle states are the project's.
 */
export const listUserIssuesUseCase = (
  input: ListUserIssuesInput,
): Effect.Effect<
  readonly UserIssueItem[],
  ListUserIssuesError,
  ChSqlClient | SqlClient | ScoreAnalyticsRepository | IssueRepository
> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", String(input.projectId))
    yield* Effect.annotateCurrentSpan("userId", String(input.userId))

    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const issueRepository = yield* IssueRepository
    const now = new Date()

    const rollups = yield* scoreAnalyticsRepository.listIssuesByUser({
      organizationId: input.organizationId,
      projectId: input.projectId,
      userId: input.userId,
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    })
    if (rollups.length === 0) return []

    const issues = yield* issueRepository.findByIds({
      projectId: input.projectId,
      issueIds: rollups.map((rollup) => rollup.issueId),
    })
    const issueById = new Map(issues.map((issue) => [issue.id, issue] as const))

    return rollups.flatMap((rollup): UserIssueItem[] => {
      const issue = issueById.get(rollup.issueId)
      if (!issue) return []
      return [
        {
          issue,
          states: deriveIssueLifecycleStates({
            issue,
            isEscalating: issue.lifecycle.isEscalating,
            isRegressed: issue.lifecycle.isRegressed,
            now,
          }),
          occurrences: rollup.occurrences,
          affectedTraces: rollup.affectedTraces,
          firstSeenAt: rollup.firstSeenAt,
          lastSeenAt: rollup.lastSeenAt,
        },
      ]
    })
  }).pipe(Effect.withSpan("issues.listUserIssues"))
