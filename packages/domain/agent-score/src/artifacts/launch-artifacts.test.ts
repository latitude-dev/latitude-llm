import { FLAGGER_DEFAULT_CLASSIFIER_MODEL, safetyJudgmentVersion, taskOutcomeJudgmentVersion } from "@domain/flaggers"
import { SCORE_DIMENSIONS } from "@domain/shared"
import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { loadAgentScoreArtifact, resolveScoringVersion } from "../entities/agent-score-artifact.ts"
import { LAUNCH_AGENT_SCORE_ARTIFACT } from "./launch-agent-score-artifact.ts"
import { resolveLaunchArtifacts, validateLaunchArtifacts } from "./launch-artifacts.ts"

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runSync(Effect.result(effect))

describe("validateLaunchArtifacts", () => {
  it("loads every bundled artifact and finds their pinned versions consistent", () => {
    const result = run(validateLaunchArtifacts())
    expect(result._tag).toBe("Success")
    if (result._tag !== "Success") return
    expect(result.success.agentScore.scoringVersion).toBe(LAUNCH_AGENT_SCORE_ARTIFACT.scoringVersion)
    expect(result.success.cost.artifactVersion).toBe(result.success.agentScore.costArtifactVersion)
    expect(result.success.catalog.catalogVersion).toBe(result.success.agentScore.costCatalogVersion)
    expect(result.success.latency.artifactVersion).toBe(result.success.agentScore.latencyArtifactVersion)
  })

  it("ships every launch artifact marked provisional until the calibration run replaces it", () => {
    const result = run(validateLaunchArtifacts())
    if (result._tag !== "Success") throw new Error("artifacts did not load")
    expect(result.success.agentScore.calibration).toBe("provisional")
    expect(result.success.cost.calibration).toBe("provisional")
  })

  it("gives the Cost artifact a curve and a cap for every catalog metric", () => {
    const result = run(validateLaunchArtifacts())
    if (result._tag !== "Success") throw new Error("artifacts did not load")
    const curveIds = new Set(
      result.success.cost.metricCurves.map((curve: { readonly curveId: string }) => curve.curveId),
    )
    for (const entry of result.success.catalog.entries) {
      expect(curveIds.has(entry.curveId)).toBe(true)
      expect(result.success.cost.metricCaps[entry.metricId]).toBeDefined()
    }
  })

  it("answers both latency lookups for every model it carries a reference for", () => {
    const result = run(validateLaunchArtifacts())
    if (result._tag !== "Success") throw new Error("artifacts did not load")
    const { latency } = result.success
    expect(latency.ttft.length).toBeGreaterThan(0)
    expect(latency.throughput.map((cohort) => `${cohort.provider}/${cohort.model}`)).toEqual(
      latency.ttft.map((cohort) => `${cohort.provider}/${cohort.model}`),
    )
  })

  it("keeps the provisional reference coarse, so no cohort claims a measured distribution", () => {
    const result = run(validateLaunchArtifacts())
    if (result._tag !== "Success") throw new Error("artifacts did not load")
    const { latency } = result.success
    expect(latency.calibration).toBe("provisional")
    for (const cohort of [...latency.ttft, ...latency.throughput]) {
      expect(cohort.granularity).toBe("providerModel")
    }
  })
})

describe("the launch Agent Score artifact", () => {
  it("weights the five dimensions as score.md fixes them", () => {
    expect(LAUNCH_AGENT_SCORE_ARTIFACT.compositeWeights).toEqual({
      outcome: 0.35,
      reliability: 0.25,
      cost: 0.15,
      speed: 0.15,
      safety: 0.1,
    })
    const total = SCORE_DIMENSIONS.reduce(
      (sum, dimension) => sum + LAUNCH_AGENT_SCORE_ARTIFACT.compositeWeights[dimension],
      0,
    )
    expect(total).toBeCloseTo(1, 12)
  })

  it("carries a floor for every dimension, so none can publish unguarded", () => {
    for (const dimension of SCORE_DIMENSIONS) {
      expect(LAUNCH_AGENT_SCORE_ARTIFACT.dimensionFloors[dimension]).toBeDefined()
    }
  })

  it("rejects weights that do not sum to one", () => {
    const result = run(
      loadAgentScoreArtifact({
        ...LAUNCH_AGENT_SCORE_ARTIFACT,
        compositeWeights: { outcome: 0.5, reliability: 0.25, cost: 0.15, speed: 0.15, safety: 0.1 },
      }),
    )
    expect(result._tag).toBe("Failure")
    if (result._tag !== "Failure") return
    expect(result.failure.issues.join()).toContain("composite weights must sum to one")
  })

  it("rejects window steps that do not ascend and a floor above the target", () => {
    const descending = run(
      loadAgentScoreArtifact({
        ...LAUNCH_AGENT_SCORE_ARTIFACT,
        window: { ...LAUNCH_AGENT_SCORE_ARTIFACT.window, stepDays: [7, 21, 14] },
      }),
    )
    expect(descending._tag).toBe("Failure")

    const inverted = run(
      loadAgentScoreArtifact({
        ...LAUNCH_AGENT_SCORE_ARTIFACT,
        window: { ...LAUNCH_AGENT_SCORE_ARTIFACT.window, sessionFloor: 2_000 },
      }),
    )
    expect(inverted._tag).toBe("Failure")
  })
})

describe("resolveScoringVersion", () => {
  const judge = FLAGGER_DEFAULT_CLASSIFIER_MODEL

  it("runs the bundled version when the deployment resolved the bundled judge", () => {
    const resolved = resolveLaunchArtifacts({ judge })
    expect(resolved.version.origin).toBe("bundled")
    expect(resolved.version.scoringVersion).toBe(LAUNCH_AGENT_SCORE_ARTIFACT.scoringVersion)
    expect(resolved.version.supportedJudgmentVersions.taskOutcome).toEqual([taskOutcomeJudgmentVersion(judge)])
    expect(resolved.version.supportedJudgmentVersions.safety).toEqual([safetyJudgmentVersion(judge)])
  })

  it("derives a distinct local version for a substituted judge", () => {
    const substituted = { provider: "openai", model: "gpt-5-mini" }
    const resolved = resolveScoringVersion({ artifact: LAUNCH_AGENT_SCORE_ARTIFACT, judge: substituted })
    expect(resolved.origin).toBe("local")
    expect(resolved.scoringVersion).not.toBe(LAUNCH_AGENT_SCORE_ARTIFACT.scoringVersion)
    expect(resolved.scoringVersion.startsWith(`${LAUNCH_AGENT_SCORE_ARTIFACT.scoringVersion}+local`)).toBe(true)
  })

  it("supports only its own judge under a local version, so two judges never pool", () => {
    const substituted = { provider: "openai", model: "gpt-5-mini" }
    const resolved = resolveScoringVersion({ artifact: LAUNCH_AGENT_SCORE_ARTIFACT, judge: substituted })
    expect(resolved.supportedJudgmentVersions.taskOutcome).toEqual([taskOutcomeJudgmentVersion(substituted)])
    expect(resolved.supportedJudgmentVersions.safety).toEqual([safetyJudgmentVersion(substituted)])
    expect(resolved.supportedJudgmentVersions.taskOutcome).not.toContain(taskOutcomeJudgmentVersion(judge))
  })

  it("gives two substituted judges different versions", () => {
    const first = resolveScoringVersion({
      artifact: LAUNCH_AGENT_SCORE_ARTIFACT,
      judge: { provider: "openai", model: "gpt-5-mini" },
    })
    const second = resolveScoringVersion({
      artifact: LAUNCH_AGENT_SCORE_ARTIFACT,
      judge: { provider: "openai", model: "gpt-5" },
    })
    expect(first.scoringVersion).not.toBe(second.scoringVersion)
  })
})
