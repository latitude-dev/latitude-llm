import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { Issue } from "../entities/issue.ts"
import type { IssueLifecycleFlags, IssueRepositoryShape, IssueWithLifecycle } from "../ports/issue-repository.ts"

const DEFAULT_LIFECYCLE: IssueLifecycleFlags = {
  isEscalating: false,
  isRegressed: false,
}

const dot = (a: readonly number[], b: readonly number[]): number =>
  a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0)

const normalize = (vector: readonly number[]): readonly number[] | null => {
  const magnitude = Math.sqrt(dot(vector, vector))
  if (magnitude === 0) return null
  return vector.map((value) => value / magnitude)
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

    hybridSearch: ({ projectId }) =>
      Effect.sync(() =>
        [...issues.values()]
          .filter((issue) => issue.projectId === projectId)
          .map((issue) => ({
            issueId: issue.id,
            name: issue.name,
            description: issue.description,
            score: 1,
          })),
      ),

    findSimilarByCentroid: ({ projectId, issueId, limit }) =>
      Effect.sync(() => {
        // Mirrors the real adapter: cosine over normalized centroid bases,
        // empty when the source is missing or has a zero-mass centroid,
        // zero-mass neighbors skipped, self excluded, project-scoped.
        const source = issues.get(issueId)
        if (!source || source.projectId !== projectId || source.centroid.mass <= 0) return []
        const sourceVector = normalize(source.centroid.base)
        if (sourceVector === null) return []
        return [...issues.values()]
          .filter((issue) => issue.projectId === projectId && issue.id !== issueId && issue.centroid.mass > 0)
          .flatMap((issue) => {
            const vector = normalize(issue.centroid.base)
            if (vector === null) return []
            return [{ issueId: issue.id, similarity: dot(sourceVector, vector) }]
          })
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit)
      }),

    searchOrgWide: ({ query, preferProjectId, limit }) =>
      Effect.sync(() => {
        // Default fake behavior: org-wide case-insensitive name match, embedding-agnostic, with the
        // preferred project's issues first. Tests that need distinct lexical vs semantic tiers
        // override this method.
        const q = query.trim().toLowerCase()
        const prefer = (projectId: string) => (preferProjectId && projectId === preferProjectId ? 1 : 0)
        return [...issues.values()]
          .filter((issue) => issue.name.toLowerCase().includes(q))
          .sort((a, b) => prefer(b.projectId) - prefer(a.projectId))
          .slice(0, limit)
          .map((issue) => ({
            issue: withLifecycle(issue),
            projectSlug: `project-${issue.projectId}`,
            projectName: `Project ${issue.projectId}`,
            score: 1,
          }))
      }),

    findBySlug: ({ projectId, slug }) =>
      Effect.gen(function* () {
        const issue = [...issues.values()].find((i) => i.projectId === projectId && i.slug === slug)
        if (!issue) return yield* new NotFoundError({ entity: "Issue", id: slug })
        return withLifecycle(issue)
      }),

    existsBySlug: ({ projectId, slug }) =>
      Effect.sync(() => [...issues.values()].some((i) => i.projectId === projectId && i.slug === slug)),

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
