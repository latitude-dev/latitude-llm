import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { Issue } from "../entities/issue.ts"
import type { IssueLifecycleFlags, IssueRepositoryShape, IssueWithLifecycle } from "../ports/issue-repository.ts"

const DEFAULT_LIFECYCLE: IssueLifecycleFlags = {
  isEscalating: false,
  isRegressed: false,
}

interface FakeIssueRepositoryOptions {
  /**
   * Per-issue lifecycle overlay. Tests that exercise escalation / regression
   * derivation set the flags here per issue id; everything else defaults to
   * `{ isEscalating: false, isRegressed: false }`.
   */
  readonly lifecycle?: ReadonlyMap<string, IssueLifecycleFlags>
}

export const createFakeIssueRepository = (
  seed: readonly Issue[] = [],
  overrides?: Partial<IssueRepositoryShape>,
  options: FakeIssueRepositoryOptions = {},
) => {
  const issues = new Map<string, Issue>(seed.map((issue) => [issue.id, issue] as const))
  const lifecycleOverlay = new Map<string, IssueLifecycleFlags>(options.lifecycle ?? [])

  const lifecycleFor = (issueId: string): IssueLifecycleFlags => lifecycleOverlay.get(issueId) ?? DEFAULT_LIFECYCLE

  const withLifecycle = (issue: Issue): IssueWithLifecycle =>
    Object.assign({}, issue, { lifecycle: lifecycleFor(issue.id) })

  const repository: IssueRepositoryShape = {
    findById: (id) =>
      Effect.gen(function* () {
        const issue = issues.get(id)
        if (!issue) return yield* new NotFoundError({ entity: "Issue", id })
        return withLifecycle(issue)
      }),

    findByIdForUpdate: (id) =>
      Effect.gen(function* () {
        const issue = issues.get(id)
        if (!issue) return yield* new NotFoundError({ entity: "Issue", id })
        return issue
      }),

    findByIds: ({ projectId, issueIds }) =>
      Effect.sync(() =>
        issueIds
          .map((issueId) => issues.get(issueId))
          .filter((issue): issue is Issue => issue !== undefined && issue.projectId === projectId)
          .map(withLifecycle),
      ),

    findByUuid: ({ projectId, uuid }) =>
      Effect.gen(function* () {
        const issue = [...issues.values()].find((i) => i.projectId === projectId && i.uuid === uuid)
        if (!issue) return yield* new NotFoundError({ entity: "Issue", id: uuid })
        return withLifecycle(issue)
      }),

    save: (issue) =>
      Effect.sync(() => {
        issues.set(issue.id, issue)
      }),

    countBySlug: ({ projectId, slug, excludeIssueId }) =>
      Effect.sync(
        () =>
          [...issues.values()].filter(
            (issue) =>
              issue.projectId === projectId && issue.slug === slug && (!excludeIssueId || issue.id !== excludeIssueId),
          ).length,
      ),

    list: ({ projectId, limit, offset }) =>
      Effect.sync(() => {
        const rows = [...issues.values()]
          .filter((issue) => issue.projectId === projectId)
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        const window = rows.slice(offset, offset + limit + 1)
        return {
          items: window.slice(0, limit).map(withLifecycle),
          hasMore: window.length > limit,
          limit,
          offset,
        }
      }),

    ...overrides,
  }

  const setLifecycle = (issueId: string, flags: IssueLifecycleFlags): void => {
    lifecycleOverlay.set(issueId, flags)
  }

  return { repository, issues, setLifecycle }
}
