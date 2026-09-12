import type { OrganizationId, ProjectId } from "@domain/shared"
import type { DimensionAttribution } from "../scoring/attribute-dimensions.ts"
import type { WindowIssues } from "../scoring/build-window-issues.ts"
import type { WindowReaderCoverage } from "../scoring/tally-reader-coverage.ts"
import type { CostWindowGate, SpeedWindowGate } from "../scoring/window-gates.ts"
import type { AgentScoreResult } from "./agent-score.ts"

/**
 * Why a project's score is what it is, as the page reads it.
 *
 * Deliberately not part of the snapshot. A stored decomposition would keep looking precise while the
 * evidence under it moved, and `score.md` is explicit that causes are resolved from the current
 * window and are never presented as the history of a number. This carries its own `computedAt` so
 * the page can say when the evidence was read rather than implying it explains the stored score.
 */
export interface AgentScoreExplanation {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly scoringVersion: string
  readonly computedAt: string
  readonly window: { readonly stepDays: number; readonly from: string; readonly to: string }
  readonly eligibleSessionCount: number
  readonly readSessionCount: number
  readonly attribution: readonly DimensionAttribution[]
  readonly issues: WindowIssues
  readonly coverage: {
    readonly cost: CostWindowGate
    readonly speed: SpeedWindowGate
    readonly readers: readonly WindowReaderCoverage[]
    readonly outcomeExaminedSessions: number
    readonly safetyExaminedSessions: number
    readonly reliabilityReadableSessions: number
    readonly unmeasuredSignalEffects: number
    readonly artifactVersions: { readonly cost: string; readonly costCatalog: string; readonly latency: string }
  }
  /** Native amounts the page shows beside the scores, labelled as context rather than scored. */
  readonly native: {
    readonly observedCriticalPathNs: number
    readonly avoidableCriticalPathNs: number
    readonly costFamilyPenalties: Readonly<Record<string, number>>
  }
}

/** Turns a completed window computation into the shape the page and the cache both use. */
export const toAgentScoreExplanation = (result: AgentScoreResult): AgentScoreExplanation | null => {
  if (!result.window || !result.coverage || !result.native) return null

  return {
    organizationId: result.organizationId,
    projectId: result.projectId,
    scoringVersion: result.scoringVersion,
    computedAt: new Date().toISOString(),
    window: {
      stepDays: result.window.stepDays,
      from: result.window.from.toISOString(),
      to: result.window.to.toISOString(),
    },
    eligibleSessionCount: result.window.eligibleSessionCount,
    readSessionCount: result.coverage.readSessionCount,
    attribution: result.attribution ?? [],
    issues: result.issues ?? { outcome: [], safety: { confirmedHarm: [], exposure: [] } },
    coverage: {
      cost: result.coverage.cost,
      speed: result.coverage.speed,
      readers: result.coverage.readers,
      outcomeExaminedSessions: result.coverage.outcome.examinedSessionCount,
      safetyExaminedSessions: result.coverage.safety.examinedSessionCount,
      reliabilityReadableSessions: result.coverage.reliability.readableSessionCount,
      unmeasuredSignalEffects: result.coverage.unmeasuredSignalEffects,
      artifactVersions: result.coverage.artifactVersions,
    },
    native: {
      observedCriticalPathNs: result.native.speed.observedNs,
      avoidableCriticalPathNs: result.native.speed.avoidableNs,
      costFamilyPenalties: result.native.cost.familyPenalties,
    },
  }
}

/**
 * Organization-prefixed, as every scoped cache key must be, and keyed by project rather than by date.
 *
 * Not a date key on purpose: a date key is what a snapshot has, and this is a cache. It expires, it
 * is rebuilt, and nothing may read it as a record of what a past day looked like.
 */
export const agentScoreExplanationCacheKey = ({
  organizationId,
  projectId,
}: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}): string => `org:${organizationId}:agent-score:explanation:${projectId}`

/** Longer than the daily cycle so a warm entry always exists, short enough that a stopped job shows through. */
export const AGENT_SCORE_EXPLANATION_TTL_SECONDS = 26 * 60 * 60
