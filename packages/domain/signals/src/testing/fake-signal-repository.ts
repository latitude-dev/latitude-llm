import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import { SIGNAL_PRIORITY_ORDER } from "../constants.ts"
import type { Signal } from "../entities/signal.ts"
import type { SignalLifecycleFlags, SignalRepositoryShape, SignalWithLifecycle } from "../ports/signal-repository.ts"

const DEFAULT_LIFECYCLE: SignalLifecycleFlags = {
  isEscalating: false,
}

const dot = (a: readonly number[], b: readonly number[]): number =>
  a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0)

const normalize = (vector: readonly number[]): readonly number[] | null => {
  const magnitude = Math.sqrt(dot(vector, vector))
  if (magnitude === 0) return null
  return vector.map((value) => value / magnitude)
}

interface FakeSignalRepositoryOptions {
  /**
   * Per-signal lifecycle overlay. Tests that exercise escalation derivation
   * set the flags here per signal id; everything else defaults to not escalating.
   */
  readonly lifecycle?: ReadonlyMap<string, SignalLifecycleFlags>
}

export const createFakeSignalRepository = (
  seed: readonly Signal[] = [],
  overrides?: Partial<SignalRepositoryShape>,
  options: FakeSignalRepositoryOptions = {},
) => {
  const issues = new Map<string, Signal>(seed.map((issue) => [issue.id, issue] as const))
  const lifecycleOverlay = new Map<string, SignalLifecycleFlags>(options.lifecycle ?? [])

  const lifecycleFor = (signalId: string): SignalLifecycleFlags => lifecycleOverlay.get(signalId) ?? DEFAULT_LIFECYCLE

  const withLifecycle = (issue: Signal): SignalWithLifecycle =>
    Object.assign({}, issue, { lifecycle: lifecycleFor(issue.id) })

  const repository: SignalRepositoryShape = {
    findById: (id) =>
      Effect.gen(function* () {
        const issue = issues.get(id)
        if (!issue) return yield* new NotFoundError({ entity: "Signal", id })
        return withLifecycle(issue)
      }),

    findByIdForUpdate: (id) =>
      Effect.gen(function* () {
        const issue = issues.get(id)
        if (!issue) return yield* new NotFoundError({ entity: "Signal", id })
        return issue
      }),

    findByIds: ({ projectId, signalIds }) =>
      Effect.sync(() =>
        signalIds
          .map((signalId) => issues.get(signalId))
          .filter((issue): issue is Signal => issue !== undefined && issue.projectId === projectId)
          .map(withLifecycle),
      ),

    hybridSearch: ({ projectId }) =>
      Effect.sync(() =>
        [...issues.values()]
          .filter((issue) => issue.projectId === projectId)
          .map((issue) => ({
            signalId: issue.id,
            name: issue.name,
            description: issue.description,
            score: 1,
          })),
      ),

    findSimilarByCentroid: ({ projectId, signalId, limit }) =>
      Effect.sync(() => {
        // Mirrors the real adapter: cosine over normalized centroid bases,
        // empty when the source is missing or has a zero-mass centroid,
        // zero-mass neighbors skipped, self excluded, project-scoped.
        const source = issues.get(signalId)
        if (!source || source.projectId !== projectId || source.centroid === null || source.centroid.mass <= 0)
          return []
        const sourceVector = normalize(source.centroid.base)
        if (sourceVector === null) return []
        return [...issues.values()]
          .filter((issue) => issue.projectId === projectId && issue.id !== signalId && (issue.centroid?.mass ?? 0) > 0)
          .flatMap((issue) => {
            if (issue.centroid === null) return []
            const vector = normalize(issue.centroid.base)
            if (vector === null) return []
            return [{ signalId: issue.id, similarity: dot(sourceVector, vector) }]
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
        if (!issue) return yield* new NotFoundError({ entity: "Signal", id: slug })
        return withLifecycle(issue)
      }),

    existsBySlug: ({ projectId, slug }) =>
      Effect.sync(() => [...issues.values()].some((i) => i.projectId === projectId && i.slug === slug)),

    save: (issue) =>
      Effect.sync(() => {
        issues.set(issue.id, issue)
      }),

    softDelete: (id) =>
      Effect.sync(() => {
        const issue = issues.get(id)
        if (issue) issues.set(id, { ...issue, deletedAt: new Date(), updatedAt: new Date() })
      }),

    countBySlug: ({ projectId, slug, excludeSignalId }) =>
      Effect.sync(
        () =>
          [...issues.values()].filter(
            (issue) =>
              issue.projectId === projectId &&
              issue.slug === slug &&
              (!excludeSignalId || issue.id !== excludeSignalId),
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

    listTableRows: ({ projectId, limit, offset, lifecycleGroup, assigneeIds, searchQuery, timeRange, sort }) =>
      Effect.sync(() => {
        const query = searchQuery?.trim().toLowerCase()
        const filtered = [...issues.values()]
          .filter((issue) => issue.projectId === projectId)
          .map(withLifecycle)
          .filter((issue) => {
            const archived = issue.mutedAt !== null
            if (lifecycleGroup === "active" && archived) return false
            if (lifecycleGroup === "archived" && !archived) return false
            if (assigneeIds?.length && !assigneeIds.includes(issue.assigneeId ?? "unassigned")) return false
            if (timeRange?.from && issue.updatedAt < timeRange.from) return false
            if (timeRange?.to && issue.updatedAt > timeRange.to) return false
            if (
              query &&
              !issue.name.toLowerCase().includes(query) &&
              !issue.description.toLowerCase().includes(query)
            ) {
              return false
            }
            return true
          })
          .sort((a, b) => {
            const groupDiff = SIGNAL_PRIORITY_ORDER[a.priority ?? "none"] - SIGNAL_PRIORITY_ORDER[b.priority ?? "none"]
            if (groupDiff !== 0) return groupDiff
            const direction = sort?.direction === "asc" ? 1 : -1
            const field = sort?.field ?? "lastSeen"
            if (field === "state") return direction * a.name.localeCompare(b.name)
            return direction * (a.updatedAt.getTime() - b.updatedAt.getTime())
          })
        const window = filtered.slice(offset, offset + limit)
        return {
          items: window,
          hasMore: offset + limit < filtered.length,
          totalCount: filtered.length,
          limit,
          offset,
        }
      }),

    ...overrides,
  }

  const setLifecycle = (signalId: string, flags: SignalLifecycleFlags): void => {
    lifecycleOverlay.set(signalId, flags)
  }

  return { repository, issues, setLifecycle }
}
