import { NotFoundError, SignalId } from "@domain/shared"
import { Effect } from "effect"
import { SIGNAL_PRIORITY_ORDER } from "../constants.ts"
import type { Signal } from "../entities/signal.ts"
import type { SignalLifecycleFlags, SignalRepositoryShape, SignalWithLifecycle } from "../ports/signal-repository.ts"
import { isSignalEligibleForScoring } from "../score-eligibility.ts"

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
  // loser id -> survivor id, the fake's stand-in for `merged_into_signal_id`.
  const mergedInto = new Map<string, string>()

  const lifecycleFor = (signalId: string): SignalLifecycleFlags => lifecycleOverlay.get(signalId) ?? DEFAULT_LIFECYCLE

  const withLifecycle = (issue: Signal): SignalWithLifecycle =>
    Object.assign({}, issue, { lifecycle: lifecycleFor(issue.id) })

  // Mirrors the adapter's predicates, kept as two so `includeUnpromoted` relaxes
  // only the promotion half — the adapter never stops filtering soft-deletes.
  // Fidelity matters here: a domain test whose fake still returns a candidate (or
  // a deleted signal) would pass while the real read leaks one. Loose comparisons
  // on purpose — Postgres hands back null, but hand-built fixtures leave an unset
  // timestamp `undefined`.
  const isLive = (issue: Signal): boolean => issue.deletedAt == null
  const isUserVisible = (issue: Signal): boolean => isLive(issue) && issue.promotedAt != null
  const isCandidate = (issue: Signal): boolean => isLive(issue) && issue.promotedAt == null
  const isReadable = (issue: Signal, includeUnpromoted?: boolean): boolean =>
    includeUnpromoted ? isLive(issue) : isUserVisible(issue)

  const repository: SignalRepositoryShape = {
    findById: (id, options) =>
      Effect.gen(function* () {
        const issue = issues.get(id)
        if (!issue) return yield* new NotFoundError({ entity: "Signal", id })
        if (!isReadable(issue, options?.includeUnpromoted)) {
          return yield* new NotFoundError({ entity: "Signal", id })
        }
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
          .filter(
            (issue): issue is Signal => issue !== undefined && issue.projectId === projectId && isUserVisible(issue),
          )
          .map(withLifecycle),
      ),

    hybridSearch: ({ projectId, includeUnpromoted }) =>
      Effect.sync(() =>
        [...issues.values()]
          .filter((issue) => issue.projectId === projectId && isReadable(issue, includeUnpromoted))
          .map((issue) => ({
            signalId: issue.id,
            name: issue.name,
            description: issue.description,
            score: 1,
          })),
      ),

    findSimilarByCentroid: ({ projectId, signalId, limit, unpromotedOnly }) =>
      Effect.sync(() => {
        // Mirrors the real adapter: cosine over normalized centroid bases,
        // empty when the source is missing or has a zero-mass centroid,
        // zero-mass neighbors skipped, self excluded, project-scoped, and the
        // same visibility predicate applied to both sides.
        const isVisible = unpromotedOnly ? isCandidate : isUserVisible
        const source = issues.get(signalId)
        if (
          !source ||
          source.projectId !== projectId ||
          !isVisible(source) ||
          source.centroid === null ||
          source.centroid.mass <= 0
        )
          return []
        const sourceVector = normalize(source.centroid.base)
        if (sourceVector === null) return []
        return [...issues.values()]
          .filter(
            (issue) =>
              issue.projectId === projectId &&
              issue.id !== signalId &&
              isVisible(issue) &&
              (issue.centroid?.mass ?? 0) > 0,
          )
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
        // preferred project's issues first. Resolved/ignored/unpromoted signals are excluded like
        // the real adapter. Tests that need distinct lexical vs semantic tiers override this method.
        const q = query.trim().toLowerCase()
        const prefer = (projectId: string) => (preferProjectId && projectId === preferProjectId ? 1 : 0)
        return [...issues.values()]
          .filter((issue) => isUserVisible(issue) && issue.resolvedAt === null && issue.ignoredAt === null)
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
        const issue = [...issues.values()].find((i) => i.projectId === projectId && i.slug === slug && isUserVisible(i))
        if (!issue) return yield* new NotFoundError({ entity: "Signal", id: slug })
        return withLifecycle(issue)
      }),

    // Slug uniqueness counts candidates: a candidate holds its slug for real.
    existsBySlug: ({ projectId, slug }) =>
      Effect.sync(() => [...issues.values()].some((i) => i.projectId === projectId && i.slug === slug)),

    save: (issue) =>
      Effect.sync(() => {
        issues.set(issue.id, issue)
      }),

    claimReopenOnOccurrence: ({ signalId, occurredAt, now }) =>
      Effect.sync(() => {
        const issue = issues.get(signalId)
        if (
          !issue ||
          issue.deletedAt != null ||
          issue.resolvedAt === null ||
          issue.ignoredAt !== null ||
          issue.resolvedAt.getTime() >= occurredAt.getTime()
        ) {
          return false
        }
        issues.set(signalId, { ...issue, resolvedAt: null, regressedAt: now, updatedAt: now })
        return true
      }),

    claimFeedback: ({ signalId, feedback, now }) =>
      Effect.sync(() => {
        const issue = issues.get(signalId)
        if (!issue || issue.deletedAt != null || issue.feedback != null) return false
        issues.set(signalId, { ...issue, feedback, updatedAt: now })
        return true
      }),

    softDelete: (id) =>
      Effect.sync(() => {
        const issue = issues.get(id)
        if (issue) issues.set(id, { ...issue, deletedAt: new Date(), updatedAt: new Date() })
      }),

    markMerged: ({ survivorId, loserIds, now }) =>
      Effect.sync(() => {
        for (const loserId of loserIds) {
          const issue = issues.get(loserId)
          if (!issue || issue.deletedAt != null) continue
          mergedInto.set(loserId, survivorId)
          issues.set(loserId, { ...issue, deletedAt: now, updatedAt: now })
        }
      }),

    findAbsorbedLineage: ({ survivorId, maxDepth }) =>
      Effect.sync(() => {
        const absorbed: SignalId[] = []
        let frontier = [survivorId as string]
        for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
          const next = [...mergedInto.entries()]
            .filter(([, target]) => frontier.includes(target))
            .map(([loserId]) => loserId)
            .filter((loserId) => !absorbed.includes(SignalId(loserId)))
          absorbed.push(...next.map((loserId) => SignalId(loserId)))
          frontier = next
        }
        return absorbed
      }),

    expireIdleCandidates: ({ idleBefore, now, limit }) =>
      Effect.sync(() => {
        const stale = [...issues.values()]
          .filter(
            (issue) => isCandidate(issue) && (issue.clusteredAt ?? issue.createdAt).getTime() < idleBefore.getTime(),
          )
          .slice(0, limit)
        for (const issue of stale) {
          issues.set(issue.id, { ...issue, deletedAt: now, updatedAt: now })
        }
        return stale.length
      }),

    countBySlug: ({ slug, excludeSignalId }) =>
      Effect.sync(
        () =>
          [...issues.values()].filter(
            (issue) =>
              issue.slug === slug && issue.deletedAt == null && (!excludeSignalId || issue.id !== excludeSignalId),
          ).length,
      ),

    list: ({ projectId, limit, offset }) =>
      Effect.sync(() => {
        const rows = [...issues.values()]
          .filter((issue) => issue.projectId === projectId && isUserVisible(issue))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        const window = rows.slice(offset, offset + limit + 1)
        return {
          items: window.slice(0, limit).map(withLifecycle),
          hasMore: window.length > limit,
          limit,
          offset,
        }
      }),

    listTableRows: ({
      projectId,
      limit,
      offset,
      lifecycleGroup,
      assigneeIds,
      scoreDimensions,
      searchQuery,
      timeRange,
      sort,
    }) =>
      Effect.sync(() => {
        const query = searchQuery?.trim().toLowerCase()
        const filtered = [...issues.values()]
          .filter((issue) => issue.projectId === projectId && isUserVisible(issue))
          .map(withLifecycle)
          .filter((issue) => {
            const archived = issue.resolvedAt !== null || issue.ignoredAt !== null
            if (lifecycleGroup === "active" && archived) return false
            if (lifecycleGroup === "archived" && !archived) return false
            if (assigneeIds?.length && !assigneeIds.includes(issue.assigneeId ?? "unassigned")) return false
            if (
              scoreDimensions?.length &&
              !issue.scoreEvidence.some((evidence) => scoreDimensions.includes(evidence.scoreDimension))
            ) {
              return false
            }
            if (timeRange?.from || timeRange?.to) {
              const inWindow = (date: Date) =>
                (!timeRange.from || date >= timeRange.from) && (!timeRange.to || date <= timeRange.to)
              if (!inWindow(issue.updatedAt) && !inWindow(issue.createdAt)) return false
            }
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

    listIdsCreatedInTimeRange: ({ projectId, timeRange }) =>
      Effect.sync(() =>
        [...issues.values()]
          .filter((issue) => issue.projectId === projectId && isUserVisible(issue))
          .filter(
            (issue) =>
              (!timeRange.from || issue.createdAt >= timeRange.from) &&
              (!timeRange.to || issue.createdAt <= timeRange.to),
          )
          .map((issue) => issue.id),
      ),

    listScoringEligibleIds: ({ projectId }) =>
      Effect.sync(() =>
        [...issues.values()]
          .filter((issue) => issue.projectId === projectId && isSignalEligibleForScoring(issue))
          .map((issue) => issue.id),
      ),

    ...overrides,
  }

  const setLifecycle = (signalId: string, flags: SignalLifecycleFlags): void => {
    lifecycleOverlay.set(signalId, flags)
  }

  return { repository, issues, setLifecycle }
}
