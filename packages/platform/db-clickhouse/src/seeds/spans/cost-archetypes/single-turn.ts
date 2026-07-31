import type { CostCohort } from "./cohorts.ts"
import { CLAUDE_HAIKU_4_5, GPT_5_MINI } from "./models.ts"

/**
 * Archetype C — a classification / RAG pipeline, and this fixture exists to catch
 * one specific bug.
 *
 * Every session is exactly one turn (`callsPerSession: 1`), every call shares the
 * same system prompt, and requests arrive seconds apart. The achievable ceiling is
 * defined over gaps across the agent's whole traffic, not within a session: two
 * unrelated users hitting the same agent 20s apart are as reusable as two turns of
 * one conversation. So the correct reading here is a ceiling near 100%, while an
 * implementation that measures within-session gaps reads ~0% — every session's only
 * call is a first call, hence an automatic miss.
 *
 * Nothing else distinguishes those two implementations, and getting it wrong would
 * systematically tell our highest-volume customers their cache is unfixable.
 *
 * The flip side is exercised too: shape curves (LAT-807) have nothing to say about
 * a project where every point sits at turns = 1.
 */
export const SINGLE_TURN_COHORTS: readonly CostCohort[] = [
  {
    key: "single-turn-classifier",
    serviceName: "intent-classifier",
    modelConfig: CLAUDE_HAIKU_4_5,
    cadence: { endDaysAgo: 0, clusters: 21, clusterSpacingHours: 24, callsPerCluster: 60, gapWithinClusterSeconds: 20 },
    cache: { kind: "prefixReuse", share: 0.94 },
    promptTokens: 5_200,
    completionTokens: 40,
    callsPerSession: 1,
  },
  {
    // Same single-turn shape at a slower cadence, so the ceiling is visibly a
    // property of arrival rate rather than a project-wide constant.
    key: "single-turn-retrieval",
    serviceName: "rag-answerer",
    modelConfig: GPT_5_MINI,
    cadence: {
      endDaysAgo: 0,
      clusters: 21,
      clusterSpacingHours: 24,
      callsPerCluster: 24,
      gapWithinClusterSeconds: 150,
    },
    cache: { kind: "prefixReuse", share: 0.88 },
    promptTokens: 18_000,
    completionTokens: 180,
    callsPerSession: 1,
  },
]
