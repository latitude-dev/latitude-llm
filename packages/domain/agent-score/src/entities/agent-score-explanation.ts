import type { OrganizationId, ProjectId } from "@domain/shared"
import { scoreDimensionSchema } from "@domain/shared"
import { z } from "zod"
import { CAUSE_DESTINATIONS } from "../scoring/attribute-dimensions.ts"
import type { AgentScoreResult } from "./agent-score.ts"
import { COST_FAMILIES } from "./cost-evidence.ts"
import { READER_LIMITATIONS } from "./session-assessment-input.ts"

const causeRowSchema = z.object({
  causeId: z.string(),
  attributedDeficit: z.number(),
  fixGain: z.number(),
  scoreDimension: scoreDimensionSchema,
  label: z.string(),
  evidence: z.enum(["measured", "associated"]),
  nativeEffect: z.object({ value: z.number(), unit: z.string() }),
  signalId: z.string().optional(),
  observationCount: z.number(),
  destination: z.enum(CAUSE_DESTINATIONS).optional(),
})

const dimensionAttributionSchema = z.object({
  scoreDimension: scoreDimensionSchema,
  rows: z.array(causeRowSchema).readonly(),
  residual: z.number(),
  totalDeficit: z.number(),
  explainedDeficit: z.number(),
  method: z.enum(["exact", "sampled"]),
  approximationError: z.number().optional(),
})

const issueRowSchema = z.object({
  issueKey: z.string(),
  label: z.string(),
  signalIds: z.array(z.string()).readonly(),
  estimatedReach: z.number().optional(),
  estimatedAdverseReach: z.number().optional(),
  examinedSessions: z.number(),
  examinedAdverseSessions: z.number(),
  ranked: z.boolean(),
})

const windowIssuesSchema = z.object({
  outcome: z.array(issueRowSchema).readonly(),
  safety: z.object({
    confirmedHarm: z.array(issueRowSchema).readonly(),
    exposure: z.array(issueRowSchema).readonly(),
  }),
})

const readerCoverageSchema = z.object({
  readerId: z.string(),
  label: z.string(),
  scoreDimensions: z.array(scoreDimensionSchema).readonly(),
  applicableSessions: z.number(),
  fullyReadSessions: z.number(),
  readableUnits: z.number(),
  applicableUnits: z.number(),
  coverage: z.number(),
  limitations: z.partialRecord(z.enum(READER_LIMITATIONS), z.number()),
})

const costWindowGateSchema = z.object({
  coverage: z.enum(["measured", "unmeasured"]),
  unmeasuredReason: z.enum(["requiredFamilyUnreadable", "publishableSessionFloor", "noReadableSessions"]).optional(),
  families: z
    .array(
      z.object({
        family: z.enum(COST_FAMILIES),
        required: z.boolean(),
        applicableReadings: z.number(),
        readableReadings: z.number(),
        coverage: z.number(),
        meetsCoverageFloor: z.boolean(),
      }),
    )
    .readonly(),
  publishableSessionCount: z.number(),
  withheldSessionCount: z.number(),
  publishableSessionShare: z.number(),
})

const speedWindowGateSchema = z.object({
  coverage: z.enum(["measured", "unmeasured"]),
  unmeasuredReason: z
    .enum(["completePathFloor", "completePathCoverageFloor", "latencyReferenceCoverage", "noObservedTime"])
    .optional(),
  completeSessionCount: z.number(),
  incompleteSessionCount: z.number(),
  completeShareOfEligible: z.number(),
})

/**
 * Why a project's score is what it is, as the page reads it.
 *
 * Deliberately not part of the snapshot. A stored decomposition would keep looking precise while the
 * evidence under it moved, and `score.md` is explicit that causes are resolved from the current
 * window and are never presented as the history of a number. This carries its own `computedAt` so
 * the page can say when the evidence was read rather than implying it explains the stored score.
 *
 * A schema rather than an interface because this shape round-trips through a cache: a reader that
 * cast whatever JSON it found would hand the page an object missing the fields it dereferences, and
 * the page would break instead of saying the explanation is not ready yet.
 */
export const agentScoreExplanationSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  scoringVersion: z.string().min(1),
  computedAt: z.string().min(1),
  window: z.object({ stepDays: z.number(), from: z.string(), to: z.string() }),
  eligibleSessionCount: z.number(),
  readSessionCount: z.number(),
  attribution: z.array(dimensionAttributionSchema).readonly(),
  issues: windowIssuesSchema,
  coverage: z.object({
    cost: costWindowGateSchema,
    speed: speedWindowGateSchema,
    readers: z.array(readerCoverageSchema).readonly(),
    outcomeExaminedSessions: z.number(),
    safetyExaminedSessions: z.number(),
    reliabilityReadableSessions: z.number(),
    unmeasuredSignalEffects: z.number(),
    artifactVersions: z.object({ cost: z.string(), costCatalog: z.string(), latency: z.string() }),
  }),
  /** Native amounts the page shows beside the scores, labelled as context rather than scored. */
  native: z.object({
    observedCriticalPathNs: z.number(),
    avoidableCriticalPathNs: z.number(),
    costFamilyPenalties: z.record(z.string(), z.number()),
  }),
})
export type AgentScoreExplanation = z.infer<typeof agentScoreExplanationSchema>

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
