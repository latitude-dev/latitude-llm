import type { AgentScoreCoverage, AgentScoreNativeInputs } from "../entities/agent-score.ts"
import type { AgentScoreArtifact } from "../entities/agent-score-artifact.ts"
import type {
  AgentScoreAvailabilityRequirement,
  AgentScoreReadiness,
  AgentScoreThresholdRequirement,
} from "../entities/agent-score-readiness.ts"
import type { CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"

const share = (count: number, total: number): number => (total > 0 ? count / total : 0)

const atLeast = (
  requirement: Omit<AgentScoreThresholdRequirement, "kind" | "comparison" | "met">,
): AgentScoreThresholdRequirement => ({
  ...requirement,
  kind: "threshold",
  comparison: "atLeast",
  met: requirement.current >= requirement.required,
})

const atMost = (
  requirement: Omit<AgentScoreThresholdRequirement, "kind" | "comparison" | "met">,
): AgentScoreThresholdRequirement => ({
  ...requirement,
  kind: "threshold",
  comparison: "atMost",
  met: requirement.current <= requirement.required,
})

const availability = ({
  metric,
  met,
}: Omit<AgentScoreAvailabilityRequirement, "kind">): AgentScoreAvailabilityRequirement => ({
  kind: "availability",
  metric,
  met,
})

export const buildAgentScoreReadiness = ({
  coverage,
  native,
  artifact,
  costArtifact,
}: {
  readonly coverage: AgentScoreCoverage
  readonly native: AgentScoreNativeInputs
  readonly artifact: AgentScoreArtifact
  readonly costArtifact: CostScoringArtifact
}): AgentScoreReadiness => {
  const eligibleSessions = coverage.eligibleSessionCount
  const costSessions = coverage.cost.publishableSessionCount + coverage.cost.withheldSessionCount
  const safetyIncompatibleEvaluations = coverage.safety.excluded.incompatibleJudgmentVersion

  return {
    sessionRequirement: atLeast({
      metric: "eligibleSessions",
      current: eligibleSessions,
      required: artifact.window.sessionFloor,
      unit: "sessions",
    }),
    dimensions: [
      {
        scoreDimension: "outcome",
        requirements: [
          // The only Outcome requirement. Its share of the window is coverage context, not a bar:
          // the judge is aimed at a fixed number of sessions, so the share falls as a project grows.
          atLeast({
            metric: "outcomeEvaluations",
            current: coverage.outcome.sampledSessionCount,
            required: artifact.dimensionFloors.outcome.examinedSessions,
            unit: "sessions",
          }),
        ],
      },
      {
        scoreDimension: "reliability",
        requirements: [
          atLeast({
            metric: "reliabilityReadableSessions",
            current: coverage.reliability.readableSessionCount,
            required: Math.max(1, artifact.dimensionFloors.reliability.readableSessions),
            unit: "sessions",
          }),
          atLeast({
            metric: "reliabilityCoverage",
            current: share(coverage.reliability.readableSessionCount, eligibleSessions),
            required: artifact.dimensionFloors.reliability.readableShareOfEligible,
            unit: "fraction",
          }),
        ],
      },
      {
        scoreDimension: "cost",
        requirements: [
          atLeast({
            metric: "costReadableSessions",
            current: coverage.cost.publishableSessionCount,
            required: 1,
            unit: "sessions",
          }),
          atLeast({
            metric: "costCoverage",
            current: share(coverage.cost.publishableSessionCount, costSessions),
            required: artifact.dimensionFloors.cost.publishableSessionShare,
            unit: "fraction",
          }),
          ...coverage.cost.families
            .filter((family) => family.required && family.applicableReadings > 0)
            .map((family) =>
              atLeast({
                metric: "costFamilyCoverage",
                subject: family.family,
                current: family.coverage,
                required: costArtifact.familyCoverageRequirements[family.family].coverageFloor,
                unit: "fraction",
              }),
            ),
        ],
      },
      {
        scoreDimension: "speed",
        requirements: [
          atLeast({
            metric: "speedCompleteSessions",
            current: coverage.speed.completeSessionCount,
            required: artifact.dimensionFloors.speed.completeCriticalPathSessions,
            unit: "sessions",
          }),
          atLeast({
            metric: "speedCoverage",
            current: coverage.speed.completeShareOfEligible,
            required: artifact.dimensionFloors.speed.completeCriticalPathShareOfEligible,
            unit: "fraction",
          }),
          availability({ metric: "speedObservedTime", met: native.speed.observedNs > 0 }),
        ],
      },
      {
        scoreDimension: "safety",
        requirements: [
          atLeast({
            metric: "safetyEvaluations",
            current: coverage.safety.examinedSessionCount,
            required: artifact.dimensionFloors.safety.examinedSessions,
            unit: "sessions",
          }),
          atMost({
            metric: "safetyRateLimitedCoverage",
            current: coverage.safety.rateLimitedHintedShare,
            required: artifact.dimensionFloors.safety.maxRateLimitedHintedShare,
            unit: "fraction",
          }),
          atMost({
            metric: "safetyIncompatibleEvaluations",
            current: safetyIncompatibleEvaluations,
            required: 0,
            unit: "sessions",
          }),
        ],
      },
    ],
  }
}
