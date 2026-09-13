import type { AgentScoreExplanationRecord } from "../../../../../../domains/agent-score/agent-score.functions.ts"
import { formatCount } from "./agent-score-format.ts"

type Explanation = NonNullable<AgentScoreExplanationRecord["explanation"]>
type PublicationDimension = Explanation["publication"]["dimensions"][number]

interface ScoreReadinessCopy {
  readonly title: string
  readonly detail: string
}

const REASON_COPY: Readonly<Record<string, string>> = {
  examinedFloor: "More sessions need a completed evaluation.",
  coverageFloor: "A larger share of sessions needs readable evaluation data.",
  incompatibleJudgment: "The evaluation results need to use the current scoring version.",
  rateLimitedHintedFloor: "More safety checks need to complete instead of being rate limited.",
  readableFloor: "More sessions need a clear completion status.",
  requiredFamilyUnreadable: "Required model, tool, memory, or recovery data is missing.",
  publishableSessionFloor: "More sessions need complete cost evidence.",
  noReadableSessions: "No sessions have enough readable cost evidence yet.",
  completePathFloor: "More sessions need complete timing data.",
  completePathCoverageFloor: "A larger share of sessions needs complete timing data.",
  noObservedTime: "No usable execution time has been observed yet.",
}

export const agentScoreReadiness = (explanation: Explanation | null): ScoreReadinessCopy => {
  if (!explanation) {
    return {
      title: "Agent Score unavailable",
      detail: "Evidence has not been prepared yet. Refresh to calculate it from the latest sessions.",
    }
  }

  if (explanation.publication.reason === "sessionFloor") {
    return {
      title: `${formatCount(explanation.eligibleSessionCount)} of ${formatCount(explanation.publication.sessionFloor)} sessions`,
      detail: `Keep sending production sessions. The score will be calculated after the minimum is reached within the last ${formatCount(explanation.window.stepDays)} days.`,
    }
  }

  const blocked = explanation.publication.dimensions.filter((dimension) => dimension.coverage === "unmeasured")
  return {
    title:
      blocked.length === 1 ? "1 dimension needs more data" : `${formatCount(blocked.length)} dimensions need more data`,
    detail: "Every dimension publishes together. Open Data coverage below to see what is missing.",
  }
}

export const dimensionReadiness = (
  dimension: PublicationDimension | undefined,
  explanation: Explanation,
): string | undefined => {
  if (explanation.publication.status === "published") return undefined
  if (explanation.publication.reason === "sessionFloor") {
    return `Waiting for ${formatCount(explanation.publication.sessionFloor - explanation.eligibleSessionCount)} more eligible sessions in this ${formatCount(explanation.window.stepDays)}-day window.`
  }
  if (!dimension || dimension.coverage === "measured") {
    return "This dimension is ready. Its score will appear when every dimension has enough data."
  }
  return REASON_COPY[dimension.unmeasuredReason ?? ""] ?? "More readable session evidence is needed for this dimension."
}
