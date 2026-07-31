import type { ProjectId, RepositoryError } from "@domain/shared"
import { classifyUnpricedPair, unpriceablePairReason } from "@domain/spans"
import { Effect } from "effect"
import { AdminProjectRepository } from "../projects/project-repository.ts"
import type {
  AdminStaleUnpricedTriage,
  AdminUnpricedPair,
  AdminUnpricedProjectRef,
  UnpricedPairState,
} from "./unpriced-pair.ts"
import type { AdminUnpricedSpanSlice } from "./unpriced-span-repository.ts"
import { AdminUnpricedSpanRepository } from "./unpriced-span-repository.ts"
import { findUnpricedTriage, UNPRICED_TRIAGE, type UnpricedTriageEntry } from "./unpriced-triage.ts"

/**
 * Long enough that a pair used a few times a week still shows up, short enough that a pair which
 * genuinely stopped occurring ages out instead of haunting the queue forever.
 */
export const UNPRICED_SPANS_WINDOW_DAYS = 30

export interface ListUnpricedSpansInput {
  readonly windowDays?: number
  /** Anchor for "now". Tests pin this; production callers leave it unset. */
  readonly now?: Date
}

export interface ListUnpricedSpansOutput {
  readonly pairs: readonly AdminUnpricedPair[]
  readonly staleTriage: readonly AdminStaleUnpricedTriage[]
  readonly windowStart: Date
  readonly windowEnd: Date
}

interface PairAccumulator {
  provider: string
  model: string
  spans: number
  tokens: number
  firstSeenAt: Date
  lastOccurrenceAt: Date
  slices: AdminUnpricedSpanSlice[]
}

const pairKey = (provider: string, model: string): string => `${provider.toLowerCase()} ${model.toLowerCase()}`

/**
 * `fixed` is checked before the derived rules so a failed fix always surfaces, even for a pair the
 * rules would otherwise park. A pair the registry prices, or one a rule rules out, needs no entry.
 */
function resolveState(
  cause: ReturnType<typeof classifyUnpricedPair>["cause"],
  triage: UnpricedTriageEntry | null,
  unpriceable: string | null,
  lastOccurrenceAt: Date,
): UnpricedPairState {
  if (triage?.decision === "fixed") {
    return lastOccurrenceAt.getTime() > Date.parse(`${triage.fixedAt}T23:59:59.999Z`) ? "regressed" : "resolved"
  }
  if (triage?.decision === "wontFix" || unpriceable !== null) return "wontFix"
  // `ingestGap` means the registry prices it today, so the rows are pre-fix leftovers; `freePricing`
  // is a correct zero. Neither is work.
  if (cause !== "missingPricing") return "resolved"
  return "active"
}

const STATE_ORDER: Record<UnpricedPairState, number> = { regressed: 0, active: 1, resolved: 2, wontFix: 3 }

export const listUnpricedSpansUseCase = (
  input: ListUnpricedSpansInput = {},
): Effect.Effect<ListUnpricedSpansOutput, RepositoryError, AdminProjectRepository | AdminUnpricedSpanRepository> =>
  Effect.gen(function* () {
    const windowDays = input.windowDays ?? UNPRICED_SPANS_WINDOW_DAYS
    const windowEnd = input.now ?? new Date()
    const windowStart = new Date(windowEnd.getTime() - windowDays * 24 * 60 * 60 * 1000)

    yield* Effect.annotateCurrentSpan("admin.unpricedSpans.windowDays", windowDays)

    const spanRepo = yield* AdminUnpricedSpanRepository
    const slices = yield* spanRepo.listUnpricedSlices({ since: windowStart })

    const byPair = new Map<string, PairAccumulator>()
    for (const slice of slices) {
      const key = pairKey(slice.provider, slice.model)
      const existing = byPair.get(key)
      if (!existing) {
        byPair.set(key, {
          provider: slice.provider,
          model: slice.model,
          spans: slice.spans,
          tokens: slice.tokens,
          firstSeenAt: slice.firstSeenAt,
          lastOccurrenceAt: slice.lastOccurrenceAt,
          slices: [slice],
        })
        continue
      }
      existing.spans += slice.spans
      existing.tokens += slice.tokens
      if (slice.firstSeenAt < existing.firstSeenAt) existing.firstSeenAt = slice.firstSeenAt
      if (slice.lastOccurrenceAt > existing.lastOccurrenceAt) existing.lastOccurrenceAt = slice.lastOccurrenceAt
      existing.slices.push(slice)
    }

    const projectIds = [...new Set(slices.map((slice) => slice.projectId))] as ProjectId[]
    const projectRepo = yield* AdminProjectRepository
    const summaries = projectIds.length
      ? yield* projectRepo.findManySummariesByIds(projectIds)
      : new Map<ProjectId, never>()

    const pairs: AdminUnpricedPair[] = []
    for (const accumulated of byPair.values()) {
      const { provider, model, spans, tokens, firstSeenAt, lastOccurrenceAt } = accumulated
      // `source` is always `unpriced` here: the repository reads the stored label and never the
      // pre-`cost_source` rows, whose zero cannot say whether it was free or unpriced.
      const { cause } = classifyUnpricedPair({ provider, model, tokens, calls: spans, source: "unpriced" })
      const triage = findUnpricedTriage(provider, model)
      const unpriceableReason = unpriceablePairReason({ provider, model })

      const projects: AdminUnpricedProjectRef[] = accumulated.slices
        .map((slice) => {
          const summary = summaries.get(slice.projectId)
          return {
            projectId: slice.projectId,
            projectName: summary?.name ?? null,
            projectSlug: summary?.slug ?? null,
            organizationId: slice.organizationId,
            organizationName: summary?.organizationName ?? null,
            organizationSlug: summary?.organizationSlug ?? null,
            spans: slice.spans,
            tokens: slice.tokens,
            lastOccurrenceAt: slice.lastOccurrenceAt,
          }
        })
        .sort((a, b) => b.tokens - a.tokens)

      pairs.push({
        provider,
        model,
        spans,
        tokens,
        firstSeenAt,
        lastOccurrenceAt,
        cause,
        state: resolveState(cause, triage, unpriceableReason, lastOccurrenceAt),
        triage,
        unpriceableReason: triage ? null : unpriceableReason,
        projects,
      })
    }

    // Regressions first, then the queue by spend; a reader should never have to scroll to find work.
    pairs.sort((a, b) => STATE_ORDER[a.state] - STATE_ORDER[b.state] || b.tokens - a.tokens)

    // Only a `wontFix` can go stale. A `fixed` entry matching nothing is the fix holding — the
    // outcome it was written for — so reporting it as clutter would train the reader to delete the
    // tripwires that are working.
    const seen = new Set(pairs.map((pair) => pairKey(pair.provider, pair.model)))
    const staleTriage = UNPRICED_TRIAGE.filter(
      (entry) => entry.decision === "wontFix" && !seen.has(pairKey(entry.provider, entry.model)),
    ).map((entry) => ({ entry }))

    return { pairs, staleTriage, windowStart, windowEnd }
  })
