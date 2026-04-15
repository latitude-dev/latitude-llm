import { AGENT_ERROR_RATES, type AgentProfile, type ConversationTopic } from "@domain/shared/seeding"
import { generateTraceByPattern } from "./pattern-generators.ts"
import {
  addMs,
  assistantTextMessage,
  clampSpansToWindowEnd,
  type Message,
  parseClickhouseTime,
  pick,
  pickByWeight,
  randInt,
  randomHex,
  randomTimeInWindow,
  type SpanRow,
  type TraceConfig,
  type TraceContext,
  userMessage,
} from "./span-builders.ts"

/**
 * Generates all traces for a single session, using topic-coherent multi-turn
 * accumulation as described in design section 5.4.3.
 */
export function generateSessionTraces(config: TraceConfig, agent: AgentProfile, sessionSize: number): SpanRow[] {
  const allSpans: SpanRow[] = []
  const conversationHistory: Message[] = []
  const topic = agent.topics ? pick(agent.topics) : undefined
  const sessionId = `session-${randomHex(8)}`
  const userId = Math.random() < agent.userIdProbability && agent.userIdPool.length > 0 ? pick(agent.userIdPool) : ""
  const environment = pick(agent.environments)
  const tags = [agent.tag, environment]
  const metadata = generateAgentMetadata(agent, environment)
  const errorRate = AGENT_ERROR_RATES[agent.serviceName] ?? 0.05

  let sessionCursor = randomTimeInWindow(config.timeWindow.from, config.timeWindow.to)

  for (let turn = 0; turn < sessionSize; turn++) {
    if (sessionCursor.getTime() >= config.timeWindow.to.getTime()) {
      break
    }

    const isFirstTurn = turn === 0

    const userPrompt = pickUserPrompt(agent, topic, isFirstTurn)
    conversationHistory.push(userMessage(userPrompt))

    const ctx: TraceContext = {
      organizationId: config.organizationId,
      projectId: config.projectId,
      apiKeyId: config.apiKeyId,
      simulationId: config.simulationId ?? "",
      startTime: sessionCursor,
      sessionId,
      userId,
      serviceName: agent.serviceName,
      tags,
      metadata,
    }

    const isError = Math.random() < errorRate
    const pattern = isError ? "error" : topic ? topic.dominantPattern : pickByWeight(agent.patternWeights).pattern

    const assistantReply = pickAssistantReply(agent, topic, isFirstTurn)
    const spans = clampSpansToWindowEnd(
      generateTraceByPattern(ctx, agent, pattern, [...conversationHistory], assistantReply),
      config.timeWindow.to,
    )
    allSpans.push(...spans)

    if (!isError) {
      conversationHistory.push(assistantTextMessage(assistantReply))
    }

    const latestEndTime = spans.reduce((latest, span) => {
      const endTime = parseClickhouseTime(span.end_time)
      return endTime.getTime() > latest.getTime() ? endTime : latest
    }, sessionCursor)
    sessionCursor = addMs(latestEndTime, randInt(5_000, 300_000))
  }

  return allSpans
}

function pickUserPrompt(agent: AgentProfile, topic: ConversationTopic | undefined, isFirstTurn: boolean): string {
  if (topic) {
    return isFirstTurn ? pick(topic.openingPrompts) : pick(topic.followUpPrompts)
  }
  if (agent.prompts) {
    return pick(agent.prompts.user)
  }
  return "Can you help me with something?"
}

function pickAssistantReply(agent: AgentProfile, topic: ConversationTopic | undefined, isFirstTurn: boolean): string {
  if (topic) {
    return isFirstTurn ? pick(topic.openingResponses) : pick(topic.followUpResponses)
  }
  if (agent.prompts) {
    return pick(agent.prompts.assistant)
  }
  return "I'd be happy to help. Let me look into that for you."
}

function generateAgentMetadata(agent: AgentProfile, environment: string): Record<string, string> {
  const meta: Record<string, string> = {
    environment,
    sdk_version: pick(["1.2.0", "1.3.1", "2.0.0-beta"]),
  }

  if (Math.random() > 0.4) {
    meta.region = pick(["us-desert-southwest", "us-mountain-west", "mars-colony-1", "eu-west-1"])
  }
  if (agent.tag === "support" && Math.random() > 0.3) {
    meta.product_category = pick(["explosives", "propulsion", "traps", "disguises", "construction", "miscellaneous"])
    meta.customer_tier = pick(["super-genius", "standard", "premium"])
    meta.channel = pick(["web", "mobile", "api", "smoke-signal"])
  }
  if (agent.tag === "internal-kb" || agent.tag === "product-copywriting") {
    meta.customer_tier = "employee"
  }

  return meta
}
