import {
  MOMENT_KINDS,
  SessionAnalysisRepository,
  SessionMomentLabelRepository,
} from "@domain/conversation-intelligence"
import { CacheStore, type ChSqlClient, OrganizationId, ProjectId, SessionId } from "@domain/shared"
import { COHORT_P90_MIN_SAMPLES, type CohortBaselineData, SessionRepository } from "@domain/spans"
import { formatCount } from "@repo/utils"
import { Effect, Option } from "effect"
import { FLAGGER_HINT_EVIDENCE_MAX_CHARS } from "../constants.ts"
import { truncateExcerpt } from "../flagger-strategies/shared.ts"
import { extractToolCallSequence, findDominantToolUsage } from "../flagger-strategies/trashing.ts"
import { collectToolCallErrorFindings } from "../helpers.ts"
import {
  deferralPatternGatherer,
  frustrationPatternGatherer,
  injectionPatternGatherer,
  nsfwPatternGatherer,
  piiPatternGatherer,
  refusalPatternGatherer,
} from "./pattern-gatherers.ts"
import type { SessionHint, SessionHintContext, SessionHintGatherer, SessionHintKind } from "./types.ts"

const MAX_TOOL_ERROR_HINTS = 10

const evidence = (text: string): string => truncateExcerpt(text, FLAGGER_HINT_EVIDENCE_MAX_CHARS)

export const spanErrorsGatherer: SessionHintGatherer = {
  name: "span-errors",
  kinds: ["span:error"],
  gather: (ctx) =>
    Effect.sync(() =>
      ctx.session.errorCount > 0
        ? [
            {
              kind: "span:error" as const,
              evidence: `${ctx.session.errorCount} of ${ctx.session.spanCount} spans have error status`,
            },
          ]
        : [],
    ),
}

export const toolErrorsGatherer: SessionHintGatherer = {
  name: "tool-errors",
  kinds: ["tool:error"],
  gather: (ctx) =>
    Effect.sync(() =>
      collectToolCallErrorFindings(ctx.conversation)
        .slice(0, MAX_TOOL_ERROR_HINTS)
        .map((finding) => ({
          kind: "tool:error" as const,
          anchor: { messageIndex: finding.messageIndex, toolCallId: finding.toolCallId },
          evidence: evidence(finding.feedback),
        })),
    ),
}

export const toolLoopGatherer: SessionHintGatherer = {
  name: "tool-loop",
  kinds: ["tool:loop"],
  gather: (ctx) =>
    Effect.sync(() => {
      const dominant = findDominantToolUsage(extractToolCallSequence(ctx.conversation))
      if (!dominant) return []
      return [
        {
          kind: "tool:loop" as const,
          evidence: `tool "${dominant.name}" is ${dominant.count} of ${dominant.total} calls (${Math.round(dominant.share * 100)}%)`,
        },
      ]
    }),
}

type MomentLabelsEnv = SessionMomentLabelRepository | SessionAnalysisRepository | ChSqlClient

export const momentLabelsGatherer: SessionHintGatherer<MomentLabelsEnv> = {
  name: "moment-labels",
  kinds: MOMENT_KINDS.map((kind) => `moment:${kind}` as const),
  gather: (ctx) =>
    Effect.gen(function* () {
      const organizationId = OrganizationId(ctx.organizationId)
      const projectId = ProjectId(ctx.projectId)
      const sessionId = SessionId(ctx.sessionId)

      const analyses = yield* SessionAnalysisRepository
      const latest = yield* analyses.findLatest({ organizationId, projectId, sessionId })
      // A skipped/failed analysis has no valid generation — prior ones are stale.
      if (!latest || latest.analysisStatus !== "analyzed") return []

      const labels = yield* SessionMomentLabelRepository
      const rows = yield* labels.listBySession({ organizationId, projectId, sessionId })

      return rows
        .filter((label) => label.analysisHash === latest.analysisHash)
        .map(
          (label): SessionHint => ({
            kind: `moment:${label.kind}`,
            anchor: { firstMessageIndex: label.firstMessageIndex, lastMessageIndex: label.lastMessageIndex },
            evidence: evidence(`${label.summary || label.kind} — ${label.evidence}`),
          }),
        )
    }).pipe(
      Effect.catch((error) =>
        Effect.logWarning("Moment-labels hint gatherer failed", { error }).pipe(Effect.as([] as SessionHint[])),
      ),
    ),
}

const COHORT_BASELINE_CACHE_TTL_SECONDS = 15 * 60

const cohortBaselineCacheKey = (organizationId: string, projectId: string): string =>
  `org:${organizationId}:flaggers:cohort-baseline:${projectId}`

const parseCachedBaseline = (value: string): CohortBaselineData | null => {
  try {
    const parsed = JSON.parse(value) as CohortBaselineData
    return parsed && typeof parsed === "object" && parsed.metrics ? parsed : null
  } catch {
    return null
  }
}

const loadCohortBaseline = (ctx: SessionHintContext) =>
  Effect.gen(function* () {
    const cacheKey = cohortBaselineCacheKey(ctx.organizationId, ctx.projectId)
    const cache = yield* Effect.serviceOption(CacheStore)

    const cached = yield* Option.match(cache, {
      onNone: () => Effect.succeed(null),
      onSome: (store) =>
        store.get(cacheKey).pipe(
          Effect.map((value) => (value ? parseCachedBaseline(value) : null)),
          Effect.catchTag("CacheError", () => Effect.succeed(null)),
        ),
    })
    if (cached) return cached

    const sessions = yield* SessionRepository
    const baseline = yield* sessions.getCohortBaseline({
      organizationId: OrganizationId(ctx.organizationId),
      projectId: ProjectId(ctx.projectId),
    })

    yield* Option.match(cache, {
      onNone: () => Effect.void,
      onSome: (store) =>
        store
          .set(cacheKey, JSON.stringify(baseline), { ttlSeconds: COHORT_BASELINE_CACHE_TTL_SECONDS })
          .pipe(Effect.catchTag("CacheError", () => Effect.void)),
    })

    return baseline
  })

const OUTLIER_METRICS = [
  { metric: "durationNs", kind: "outlier:duration", value: (ctx: SessionHintContext) => ctx.session.durationNs },
  {
    metric: "timeToFirstTokenNs",
    kind: "outlier:ttft",
    value: (ctx: SessionHintContext) => ctx.session.timeToFirstTokenNs,
  },
  { metric: "tokensTotal", kind: "outlier:tokens", value: (ctx: SessionHintContext) => ctx.session.tokensTotal },
  {
    metric: "costTotalMicrocents",
    kind: "outlier:cost",
    value: (ctx: SessionHintContext) => ctx.session.costTotalMicrocents,
  },
] as const satisfies readonly {
  readonly metric: keyof CohortBaselineData["metrics"]
  readonly kind: SessionHintKind
  readonly value: (ctx: SessionHintContext) => number
}[]

export const analyticalOutliersGatherer: SessionHintGatherer<SessionRepository | ChSqlClient> = {
  name: "analytical-outliers",
  kinds: OUTLIER_METRICS.map((entry) => entry.kind),
  gather: (ctx) =>
    Effect.gen(function* () {
      const baseline = yield* loadCohortBaseline(ctx)

      const hints: SessionHint[] = []
      for (const { metric, kind, value } of OUTLIER_METRICS) {
        const percentiles = baseline.metrics[metric]
        if (!percentiles || percentiles.sampleCount < COHORT_P90_MIN_SAMPLES) continue
        const sessionValue = value(ctx)
        if (sessionValue <= 0 || percentiles.p90 <= 0 || sessionValue < percentiles.p90) continue
        hints.push({
          kind,
          evidence: `session ${metric} ${formatCount(Math.round(sessionValue))} ≥ project p90 ${formatCount(Math.round(percentiles.p90))}`,
        })
      }
      return hints
    }).pipe(
      Effect.catch((error) =>
        Effect.logWarning("Analytical-outliers hint gatherer failed", { error }).pipe(Effect.as([] as SessionHint[])),
      ),
    ),
}

export type SessionHintGatherEnv = MomentLabelsEnv | SessionRepository

export const SESSION_HINT_GATHERERS: readonly SessionHintGatherer<SessionHintGatherEnv>[] = [
  spanErrorsGatherer,
  toolErrorsGatherer,
  toolLoopGatherer,
  analyticalOutliersGatherer,
  momentLabelsGatherer,
  frustrationPatternGatherer,
  refusalPatternGatherer,
  deferralPatternGatherer,
  injectionPatternGatherer,
  nsfwPatternGatherer,
  piiPatternGatherer,
]

// A crashing gatherer contributes zero hints and never blocks the pass.
export const gatherSessionHintsUseCase = Effect.fn("flaggers.gatherSessionHints")(function* (ctx: SessionHintContext) {
  const results = yield* Effect.forEach(
    SESSION_HINT_GATHERERS,
    (gatherer) =>
      gatherer
        .gather(ctx)
        .pipe(
          Effect.catchDefect((defect) =>
            Effect.logWarning("Session hint gatherer crashed", { gatherer: gatherer.name, defect }).pipe(
              Effect.as([] as readonly SessionHint[]),
            ),
          ),
        ),
    { concurrency: "unbounded" },
  )

  return results.flat()
})
