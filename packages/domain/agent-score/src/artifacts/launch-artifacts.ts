import { Effect } from "effect"
import {
  type AgentScoreArtifact,
  loadAgentScoreArtifact,
  type ResolvedScoringVersion,
  resolveScoringVersion,
  type ScoringJudge,
} from "../entities/agent-score-artifact.ts"
import { type CostMetricCatalog, PROVISIONAL_COST_METRIC_CATALOG } from "../entities/cost-metric-catalog.ts"
import {
  type CostScoringArtifact,
  loadCostMetricCatalog,
  loadCostScoringArtifact,
} from "../entities/cost-scoring-artifact.ts"
import { type LatencyReferenceArtifact, loadLatencyReferenceArtifact } from "../entities/latency-reference-artifact.ts"
import { InvalidAgentScoreArtifactError } from "../errors.ts"
import { LAUNCH_AGENT_SCORE_ARTIFACT } from "./launch-agent-score-artifact.ts"
import { LAUNCH_COST_SCORING_ARTIFACT } from "./launch-cost-scoring-artifact.ts"
import { LAUNCH_LATENCY_REFERENCE_ARTIFACT } from "./launch-latency-reference-artifact.ts"

export interface LaunchArtifacts {
  readonly agentScore: AgentScoreArtifact
  readonly cost: CostScoringArtifact
  readonly catalog: CostMetricCatalog
  readonly latency: LatencyReferenceArtifact
}

export interface ResolvedLaunchArtifacts extends LaunchArtifacts {
  readonly version: ResolvedScoringVersion
}

/**
 * Every scoring input this deployment runs under, from one place.
 *
 * Hosted and self-hosted call this and get the same formulas, the same curves and the same frozen
 * references; the only thing a deployment can change is which judge it resolved, and
 * `resolveScoringVersion` turns that into a distinct version rather than an environment branch.
 * There is deliberately no conditional here on env, tier or organisation: a score that depended on
 * where it ran could not be compared with the score beside it.
 */
export const resolveLaunchArtifacts = ({ judge }: { readonly judge: ScoringJudge }): ResolvedLaunchArtifacts => ({
  version: resolveScoringVersion({ artifact: LAUNCH_AGENT_SCORE_ARTIFACT, judge }),
  agentScore: LAUNCH_AGENT_SCORE_ARTIFACT,
  cost: LAUNCH_COST_SCORING_ARTIFACT,
  catalog: PROVISIONAL_COST_METRIC_CATALOG,
  latency: LAUNCH_LATENCY_REFERENCE_ARTIFACT,
})

const pinIssues = ({ agentScore, cost, catalog, latency }: LaunchArtifacts): string[] => [
  ...(agentScore.costArtifactVersion === cost.artifactVersion
    ? []
    : [`costArtifactVersion: pinned ${agentScore.costArtifactVersion}, bundled ${cost.artifactVersion}`]),
  ...(agentScore.costCatalogVersion === catalog.catalogVersion
    ? []
    : [`costCatalogVersion: pinned ${agentScore.costCatalogVersion}, bundled ${catalog.catalogVersion}`]),
  ...(agentScore.latencyArtifactVersion === latency.artifactVersion
    ? []
    : [`latencyArtifactVersion: pinned ${agentScore.latencyArtifactVersion}, bundled ${latency.artifactVersion}`]),
]

/**
 * Proves the bundled artifacts parse, satisfy their refinements, and pin each other consistently.
 *
 * `satisfies` covers their shape at compile time but cannot run a refinement, so weights that no
 * longer sum to one, a curve that stopped ascending, or a cost artifact swapped without updating
 * the version it is pinned by would all typecheck. This is what catches them, and it is why it runs
 * as a test rather than only at startup: a broken artifact should fail the build, not the first
 * scoring job of the day.
 */
export const validateLaunchArtifacts = (): Effect.Effect<LaunchArtifacts, InvalidAgentScoreArtifactError> =>
  Effect.gen(function* () {
    const agentScore = yield* loadAgentScoreArtifact(LAUNCH_AGENT_SCORE_ARTIFACT)
    const catalog = yield* loadCostMetricCatalog(PROVISIONAL_COST_METRIC_CATALOG)
    const cost = yield* loadCostScoringArtifact({ artifact: LAUNCH_COST_SCORING_ARTIFACT, catalog })
    const latency = yield* loadLatencyReferenceArtifact(LAUNCH_LATENCY_REFERENCE_ARTIFACT)
    const artifacts = { agentScore, cost, catalog, latency }
    const issues = pinIssues(artifacts)
    return issues.length > 0
      ? yield* new InvalidAgentScoreArtifactError({ scoringVersion: agentScore.scoringVersion, issues })
      : artifacts
  }).pipe(
    Effect.mapError((error) =>
      error._tag === "InvalidAgentScoreArtifactError"
        ? error
        : new InvalidAgentScoreArtifactError({ issues: error.issues }),
    ),
  )
