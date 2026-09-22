import { FLAGGER_DEFAULT_CLASSIFIER_MODEL, safetyJudgmentVersion, taskOutcomeJudgmentVersion } from "@domain/flaggers"
import type { AgentScoreArtifact } from "../entities/agent-score-artifact.ts"
import { PROVISIONAL_COST_METRIC_CATALOG } from "../entities/cost-metric-catalog.ts"
import { LAUNCH_COST_ARTIFACT_VERSION } from "./launch-cost-scoring-artifact.ts"
import { LAUNCH_LATENCY_ARTIFACT_VERSION } from "./launch-latency-reference-artifact.ts"

export const LAUNCH_SCORING_VERSION = "agent-score-v6-provisional"

const BUNDLED_JUDGE = FLAGGER_DEFAULT_CLASSIFIER_MODEL

/**
 * Everything a scoring version pins, in one place.
 *
 * `score.md` lists ten changes that require a version bump, and every one of them is a field here or
 * a pinned version of another artifact. That is the point: a bump is an edit to this file plus the
 * artifacts it names, not a search for constants across readers, estimators and components.
 *
 * The floors are provisional. Outcome's and Safety's came from PRs 4 and 5, Reliability's, Speed's
 * and Cost's are first guesses, and all of them are what P6-55 and P6-53 replace against measured
 * traffic.
 */
export const LAUNCH_AGENT_SCORE_ARTIFACT = {
  scoringVersion: LAUNCH_SCORING_VERSION,
  calibration: "provisional",
  compositeWeights: { outcome: 0.35, reliability: 0.25, cost: 0.15, speed: 0.15, safety: 0.1 },
  referenceRuns: { reliability: 20, safety: 100 },
  window: { stepDays: [7, 14, 21, 28], sessionTarget: 50, sessionFloor: 50, hysteresisMargin: 0.1 },
  dimensionFloors: {
    outcome: { examinedSessions: 50 },
    // A census rather than a sample, so the bar is how much of the base could be read at all.
    reliability: { readableSessions: 50, readableShareOfEligible: 0.8 },
    cost: { publishableSessionShare: 0.8 },
    speed: { completeCriticalPathSessions: 50, completeCriticalPathShareOfEligible: 0.5 },
    safety: { examinedSessions: 50, maxRateLimitedHintedShare: 0.1 },
  },
  outcomeDegradation: {
    degradedWeight: 0.75,
    minAnalyzedSessions: 50,
    // `hesitation` and `stalling` are not quality deficits. `policy_refusal` is the agent working
    // correctly. The positive kinds never enter: requiring good news to call a session clean would
    // make a detector that failed to fire lower the score, which is coverage penalising rather than
    // flattering, and just as wrong.
    rules: [
      { kind: "user_frustration", minConfidence: 0.85, minOccurrences: 1 },
      { kind: "abandonment", minConfidence: 0.85, minOccurrences: 1 },
      { kind: "escalation", minConfidence: 0.85, minOccurrences: 1 },
      { kind: "clarification_loop", minConfidence: 0.8, minOccurrences: 1 },
      { kind: "user_correction", minConfidence: 0.8, minOccurrences: 3 },
    ],
  },
  costArtifactVersion: LAUNCH_COST_ARTIFACT_VERSION,
  costCatalogVersion: PROVISIONAL_COST_METRIC_CATALOG.catalogVersion,
  latencyArtifactVersion: LAUNCH_LATENCY_ARTIFACT_VERSION,
  supportedJudgmentVersions: {
    taskOutcome: [taskOutcomeJudgmentVersion(BUNDLED_JUDGE)],
    safety: [safetyJudgmentVersion(BUNDLED_JUDGE)],
  },
} satisfies AgentScoreArtifact
