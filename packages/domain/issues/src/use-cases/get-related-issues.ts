import { ScoreAnalyticsRepository } from "@domain/scores"
import {
  type ChSqlClient,
  IssueId,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  type SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import { ISSUE_RELATED_CANDIDATE_LIMIT, ISSUE_RELATED_COOCCURRENCE_WINDOW_DAYS } from "../constants.ts"
import type { IssueState } from "../entities/issue.ts"
import { deriveIssueLifecycleStates } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"
import { type RelatedIssueSignals, rankRelatedIssues } from "../related-issues.ts"

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export interface GetRelatedIssuesInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly issueId: IssueId
  readonly now?: Date
}

/** One Related-list row: scored signals hydrated with the canonical issue. */
export interface RelatedIssue extends RelatedIssueSignals {
  readonly slug: string
  readonly name: string
  readonly states: readonly IssueState[]
}

export type GetRelatedIssuesError = RepositoryError

/**
 * The Related-issues read: runs the two candidate reads in parallel —
 * semantic neighbors (pgvector centroid cosine, lifetime) and session
 * co-occurrence counts (ClickHouse, trailing
 * `ISSUE_RELATED_COOCCURRENCE_WINDOW_DAYS`) — fuses them with the pure
 * scorer (`rankRelatedIssues`), and hydrates the surviving rows from
 * Postgres with lifecycle states derived here. Resolved/ignored issues are
 * included by design: "a similar issue was already resolved" is the most
 * actionable row. Project-scoped only.
 */
export const getRelatedIssuesUseCase = (
  input: GetRelatedIssuesInput,
): Effect.Effect<
  readonly RelatedIssue[],
  GetRelatedIssuesError,
  ChSqlClient | IssueRepository | ScoreAnalyticsRepository | SqlClient
> =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("projectId", String(input.projectId))
    yield* Effect.annotateCurrentSpan("issueId", String(input.issueId))

    const issueRepository = yield* IssueRepository
    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository
    const now = input.now ?? new Date()
    const from = new Date(now.getTime() - ISSUE_RELATED_COOCCURRENCE_WINDOW_DAYS * MILLISECONDS_PER_DAY)

    const [neighbors, coOccurrence] = yield* Effect.all(
      [
        issueRepository.findSimilarByCentroid({
          projectId: input.projectId,
          issueId: input.issueId,
          limit: ISSUE_RELATED_CANDIDATE_LIMIT,
        }),
        scoreAnalyticsRepository.coOccurrenceByIssue({
          organizationId: input.organizationId,
          projectId: input.projectId,
          issueId: input.issueId,
          timeRange: { from, to: now },
          limit: ISSUE_RELATED_CANDIDATE_LIMIT,
        }),
      ],
      { concurrency: 2 },
    )

    const ranked = rankRelatedIssues({ neighbors, coOccurrence })
    if (ranked.length === 0) return []

    const issues = yield* issueRepository.findByIds({
      projectId: input.projectId,
      issueIds: ranked.map((signals) => IssueId(signals.issueId)),
    })
    const issuesById = new Map(issues.map((issue) => [issue.id as string, issue]))

    return ranked.flatMap((signals): RelatedIssue[] => {
      // A candidate can vanish between the analytics read and hydration (or
      // exist only in ClickHouse after a Postgres delete) — drop it silently.
      const issue = issuesById.get(signals.issueId)
      if (issue === undefined) return []
      return [
        {
          ...signals,
          slug: issue.slug,
          name: issue.name,
          states: deriveIssueLifecycleStates({
            issue,
            isEscalating: issue.lifecycle.isEscalating,
            isRegressed: issue.lifecycle.isRegressed,
            now,
          }),
        },
      ]
    })
  }).pipe(Effect.withSpan("issues.getRelatedIssues"))
