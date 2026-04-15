import { AGENT_ERROR_RATES, AGENT_PROFILES, type AgentProfile } from "@domain/shared/seeding"
import { generateTraceByPattern } from "./pattern-generators.ts"
import { generateSessionTraces } from "./session-generator.ts"
import {
  clampSpansToWindowEnd,
  pick,
  pickByWeight,
  randomTimeInWindow,
  type SpanRow,
  type TraceConfig,
  type TraceContext,
  userMessage,
} from "./span-builders.ts"

export type { SpanRow, TraceConfig } from "./span-builders.ts"

// ---------------------------------------------------------------------------
// Per-agent generation loop (design section 5.9)
// ---------------------------------------------------------------------------

/**
 * Generates all spans across all agent profiles.
 * Each agent owns a trace budget, session config, and content pools.
 */
export function generateAllSpans(config: TraceConfig): SpanRow[] {
  const allSpans: SpanRow[] = []

  for (const agent of AGENT_PROFILES) {
    const traceBudget = Math.round(config.traceCount * agent.traceBudgetWeight)
    const spans = generateAgentSpans(config, agent, traceBudget)
    allSpans.push(...spans)
  }

  return allSpans
}

function generateAgentSpans(config: TraceConfig, agent: AgentProfile, traceBudget: number): SpanRow[] {
  const allSpans: SpanRow[] = []

  if (agent.sessionConfig.enabled) {
    let tracesUsed = 0

    while (tracesUsed < traceBudget) {
      const sessionSize = pickSessionSize(agent)
      const actualSize = Math.min(sessionSize, traceBudget - tracesUsed)
      if (actualSize < 1) break

      const spans = generateSessionTraces(config, agent, actualSize)
      allSpans.push(...spans)
      tracesUsed += actualSize
    }
  } else {
    for (let i = 0; i < traceBudget; i++) {
      const spans = generateIndependentTrace(config, agent)
      allSpans.push(...spans)
    }
  }

  return allSpans
}

function pickSessionSize(agent: AgentProfile): number {
  const dist = agent.sessionConfig.sizeDistribution
  if (dist.length === 0) return 1
  return pickByWeight(dist).size
}

function generateIndependentTrace(config: TraceConfig, agent: AgentProfile): SpanRow[] {
  const errorRate = AGENT_ERROR_RATES[agent.serviceName] ?? 0.05
  const isError = Math.random() < errorRate
  const pattern = isError ? "error" : pickByWeight(agent.patternWeights).pattern

  const userPrompt = agent.prompts ? pick(agent.prompts.user) : "Process this request."
  const assistantReply = agent.prompts ? pick(agent.prompts.assistant) : "Request processed successfully."

  const environment = pick(agent.environments)
  const tags = [agent.tag, environment]
  const userId = Math.random() < agent.userIdProbability && agent.userIdPool.length > 0 ? pick(agent.userIdPool) : ""

  const metadata: Record<string, string> = {
    environment,
    sdk_version: pick(["1.2.0", "1.3.1", "2.0.0-beta"]),
  }
  if (Math.random() > 0.4) {
    metadata.region = pick(["us-desert-southwest", "us-mountain-west", "mars-colony-1", "eu-west-1"])
  }

  const ctx: TraceContext = {
    organizationId: config.organizationId,
    projectId: config.projectId,
    apiKeyId: config.apiKeyId,
    simulationId: config.simulationId ?? "",
    startTime: randomTimeInWindow(config.timeWindow.from, config.timeWindow.to),
    sessionId: "",
    userId,
    serviceName: agent.serviceName,
    tags,
    metadata,
  }

  return clampSpansToWindowEnd(
    generateTraceByPattern(ctx, agent, pattern, [userMessage(userPrompt)], assistantReply),
    config.timeWindow.to,
  )
}
