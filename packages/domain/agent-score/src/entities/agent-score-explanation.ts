import type { OrganizationId, ProjectId } from "@domain/shared"
import { scoreDimensionSchema } from "@domain/shared"
import { z } from "zod"
import { CAUSE_DESTINATIONS } from "../scoring/attribute-dimensions.ts"
import type { AgentScoreResult } from "./agent-score.ts"
import { agentScoreReadinessSchema } from "./agent-score-readiness.ts"
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
  exampleSessionIds: z.array(z.string()).readonly().optional(),
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

const observedCauseSchema = z.object({
  scoreDimension: scoreDimensionSchema,
  causeId: z.string(),
  label: z.string(),
  measurement: z.enum(["measured", "associated", "notMeasured"]),
  nativeEffect: z.object({ value: z.number(), unit: z.string() }),
  observationCount: z.number(),
  signalId: z.string().optional(),
  destination: z.enum(CAUSE_DESTINATIONS).optional(),
  exampleSessionIds: z.array(z.string()).readonly().optional(),
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
  /** Optional so a cached explanation written before the field existed still parses. */
  exampleSessionIds: z.array(z.string()).readonly().optional(),
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

/** Score evidence is stored with published snapshots; unpublished computations use the cache. */
export const agentScoreExplanationSchema = z.object({
  organizationId: z.string().min(1),
  projectId: z.string().min(1),
  date: z.string().min(1),
  scoringVersion: z.string().min(1),
  computedAt: z.string().min(1),
  window: z.object({ stepDays: z.number(), from: z.string(), to: z.string() }),
  eligibleSessionCount: z.number(),
  readSessionCount: z.number(),
  publication: z.object({
    status: z.enum(["published", "withheld"]),
    reason: z.enum(["sessionFloor", "unmeasuredDimensions"]).optional(),
    sessionFloor: z.number(),
    dimensions: z
      .array(
        z.object({
          scoreDimension: scoreDimensionSchema,
          coverage: z.enum(["measured", "unmeasured"]),
          unmeasuredReason: z.string().optional(),
        }),
      )
      .readonly(),
  }),
  attribution: z.array(dimensionAttributionSchema).readonly(),
  observedCauses: z.array(observedCauseSchema).readonly(),
  issues: windowIssuesSchema,
  coverage: z.object({
    cost: costWindowGateSchema,
    speed: speedWindowGateSchema,
    readers: z.array(readerCoverageSchema).readonly(),
    /** Sampled verdicts plus the deterministic census: everything Outcome looked at. */
    outcomeExaminedSessions: z.number(),
    /**
     * Compatible sampled verdicts alone, which is what the readiness floor counts.
     *
     * Optional because snapshots written before v6 carry only the examined count; a reader that
     * needs the judged population falls back to it rather than inventing one.
     */
    outcomeSampledSessions: z.number().optional(),
    safetyExaminedSessions: z.number(),
    reliabilityReadableSessions: z.number(),
    unmeasuredSignalEffects: z.number(),
    artifactVersions: z.object({ cost: z.string(), costCatalog: z.string(), latency: z.string() }),
  }),
  readiness: agentScoreReadinessSchema,
  /** Native amounts the page shows beside the scores, labelled as context rather than scored. */
  native: z.object({
    observedCriticalPathNs: z.number(),
    avoidableCriticalPathNs: z.number(),
    costFamilyPenalties: z.record(z.string(), z.number()),
  }),
})
export type AgentScoreExplanation = z.infer<typeof agentScoreExplanationSchema>

/** Turns a completed window computation into the shape the page and the cache both use. */
export const toAgentScoreExplanation = ({
  result,
  date,
}: {
  readonly result: AgentScoreResult
  readonly date: string
}): AgentScoreExplanation | null => {
  if (!result.coverage || !result.native || !result.readiness) return null

  return {
    organizationId: result.organizationId,
    projectId: result.projectId,
    date,
    scoringVersion: result.scoringVersion,
    computedAt: new Date().toISOString(),
    window: {
      stepDays: result.window.stepDays,
      from: result.window.from.toISOString(),
      to: result.window.to.toISOString(),
    },
    eligibleSessionCount: result.window.eligibleSessionCount,
    readSessionCount: result.coverage.readSessionCount,
    publication: {
      status: result.status,
      ...(result.withheldReason ? { reason: result.withheldReason } : {}),
      sessionFloor: result.sessionFloor,
      dimensions: result.dimensions.map((dimension) => ({
        scoreDimension: dimension.scoreDimension,
        coverage: dimension.coverage,
        ...(dimension.unmeasuredReason ? { unmeasuredReason: dimension.unmeasuredReason } : {}),
      })),
    },
    attribution: result.attribution ?? [],
    observedCauses: result.observedCauses ?? [],
    issues: result.issues ?? { outcome: [], safety: { confirmedHarm: [], exposure: [] } },
    coverage: {
      cost: result.coverage.cost,
      speed: result.coverage.speed,
      readers: result.coverage.readers,
      outcomeExaminedSessions: result.coverage.outcome.examinedSessionCount,
      outcomeSampledSessions: result.coverage.outcome.sampledSessionCount,
      safetyExaminedSessions: result.coverage.safety.examinedSessionCount,
      reliabilityReadableSessions: result.coverage.reliability.readableSessionCount,
      unmeasuredSignalEffects: result.coverage.unmeasuredSignalEffects,
      artifactVersions: result.coverage.artifactVersions,
    },
    readiness: result.readiness,
    native: {
      observedCriticalPathNs: result.native.speed.observedNs,
      avoidableCriticalPathNs: result.native.speed.avoidableNs,
      costFamilyPenalties: result.native.cost.familyPenalties,
    },
  }
}

export const agentScoreExplanationCacheKey = ({
  organizationId,
  projectId,
  date,
}: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly date: string
}): string => `org:${organizationId}:agent-score:explanation:${projectId}:${date}`

export const latestAgentScoreExplanationCacheKey = ({
  organizationId,
  projectId,
}: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
}): string => `org:${organizationId}:agent-score:latest-explanation:${projectId}`

/** Longer than the daily cycle so a warm entry always exists, short enough that a stopped job shows through. */
export const AGENT_SCORE_EXPLANATION_TTL_SECONDS = 26 * 60 * 60
