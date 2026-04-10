import { type IssueOccurrenceAggregate, ScoreAnalyticsRepository } from "@domain/scores"
import { cuidSchema, OrganizationId, ProjectId, type RepositoryError } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import type { Issue, IssueState } from "../entities/issue.ts"
import { deriveIssueLifecycleStates } from "../helpers.ts"
import { IssueRepository } from "../ports/issue-repository.ts"

const listIssuesInputSchema = z.object({
  organizationId: cuidSchema.transform(OrganizationId),
  projectId: cuidSchema.transform(ProjectId),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
  now: z.date().optional(),
})

export type ListIssuesInput = z.input<typeof listIssuesInputSchema>
export type ListIssuesError = RepositoryError
export type IssueListItem = Issue & {
  readonly states: readonly IssueState[]
}

export interface IssueListResult {
  readonly items: readonly IssueListItem[]
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

const toIssueListItem = ({
  issue,
  occurrence,
  now,
}: {
  readonly issue: Issue
  readonly occurrence: IssueOccurrenceAggregate | null
  readonly now: Date
}): IssueListItem => ({
  ...issue,
  states: deriveIssueLifecycleStates({
    issue,
    occurrence,
    now,
  }),
})

export const listIssuesUseCase = (
  input: ListIssuesInput,
): Effect.Effect<IssueListResult, ListIssuesError, IssueRepository | ScoreAnalyticsRepository> =>
  Effect.gen(function* () {
    const parsed = listIssuesInputSchema.parse(input)
    const repo = yield* IssueRepository
    const scoreAnalyticsRepository = yield* ScoreAnalyticsRepository

    const issuesPage = yield* repo.list({
      projectId: parsed.projectId,
      limit: parsed.limit,
      offset: parsed.offset,
    })

    const issueIds = issuesPage.items.map((issue) => issue.id)
    const occurrences =
      issueIds.length === 0
        ? []
        : yield* scoreAnalyticsRepository.aggregateByIssues({
            organizationId: parsed.organizationId,
            projectId: parsed.projectId,
            issueIds,
          })
    const occurrencesByIssueId = new Map(occurrences.map((occurrence) => [occurrence.issueId, occurrence] as const))
    const now = parsed.now ?? new Date()

    return {
      ...issuesPage,
      items: issuesPage.items.map((issue) =>
        toIssueListItem({
          issue,
          occurrence: occurrencesByIssueId.get(issue.id) ?? null,
          now,
        }),
      ),
    }
  })
