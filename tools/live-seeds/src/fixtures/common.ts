import {
  ISSUE_1_NEGATIVE_TRACES,
  ISSUE_2_POSITIVE_TRACES,
  KNOWLEDGE_ASSISTANT_SYSTEM_PROMPT,
  ORDER_ROUTER_SYSTEM_PROMPT,
  QA_CLASSIFIER_SYSTEM_PROMPT,
} from "@domain/shared/seeding"
import type { SeedChatSpanDefinition, SeedMessage, SeedSpanDefinition, SeedSystemPart } from "../otlp.ts"
import type { SeededRng } from "../random.ts"
import type { LiveSeedGeneratedCase, LiveSeedGeneratedCaseTrace } from "../types.ts"

type UsageProfile = "tiny" | "low" | "medium" | "high" | "veryHigh"

export type GeneratedConversationTurnDefinition = {
  readonly key?: string
  readonly inputAdditions: readonly SeedMessage[]
  readonly outputMessages: readonly SeedMessage[]
  readonly durationRangeMs?: readonly [number, number]
  readonly gapAfterRangeMs?: readonly [number, number]
  readonly usageProfile: UsageProfile
  readonly finishReasons?: readonly string[]
  readonly forceReasoning?: boolean
}

type TraceFamily = "support" | "control"

const DEFAULT_DURATION_RANGE: readonly [number, number] = [850, 2_300]
const DEFAULT_CONVERSATION_GAP_RANGE: readonly [number, number] = [4_000, 18_000]

const USAGE_PROFILES: Record<
  UsageProfile,
  {
    readonly costRangeUsd: readonly [number, number]
    readonly inputJitter: readonly [number, number]
    readonly outputJitter: readonly [number, number]
    readonly reasoningChance: number
  }
> = {
  tiny: {
    costRangeUsd: [0.0000002, 0.0000006],
    inputJitter: [-6, 4],
    outputJitter: [-6, 4],
    reasoningChance: 0,
  },
  low: {
    costRangeUsd: [0.0000006, 0.0000018],
    inputJitter: [-8, 10],
    outputJitter: [-6, 12],
    reasoningChance: 0.05,
  },
  medium: {
    costRangeUsd: [0.0000018, 0.0000046],
    inputJitter: [-12, 18],
    outputJitter: [-8, 18],
    reasoningChance: 0.2,
  },
  high: {
    costRangeUsd: [0.0000075, 0.0000118],
    inputJitter: [-18, 30],
    outputJitter: [-12, 28],
    reasoningChance: 0.6,
  },
  veryHigh: {
    costRangeUsd: [0.0000118, 0.0000175],
    inputJitter: [-20, 36],
    outputJitter: [-16, 36],
    reasoningChance: 0.85,
  },
}

export const LIVE_QUEUE_COST_THRESHOLD_USD = 0.000005
export const SUPPORT_SERVICE_NAME = "acme-support-agent"
export const ORDER_ROUTER_SERVICE_NAME = "acme-order-router"
export const QA_TRIAGE_SERVICE_NAME = "acme-qa-classifier"
export const INTERNAL_KB_SERVICE_NAME = "acme-knowledge-assistant"

export const SUPPORT_SYSTEM_INSTRUCTIONS: readonly SeedSystemPart[] = [
  {
    type: "text",
    content:
      "You are Acme's customer support assistant. Follow written policy, avoid inventing coverage or exceptions, and explain outcomes clearly.",
  },
]

export const ORDER_ROUTER_SYSTEM_INSTRUCTIONS: readonly SeedSystemPart[] = [
  {
    type: "text",
    content: ORDER_ROUTER_SYSTEM_PROMPT,
  },
]

export const QA_TRIAGE_SYSTEM_INSTRUCTIONS: readonly SeedSystemPart[] = [
  {
    type: "text",
    content: QA_CLASSIFIER_SYSTEM_PROMPT,
  },
]

const SUPPORT_USER_NAMES = ["wile", "petra", "daria", "miguel", "samir", "lucy"] as const
const EMPLOYEE_USER_NAMES = ["alice", "marco", "ina", "ben", "noah", "riley"] as const

const FIXTURE_SCOPE_NAME = "@tools/live-seeds"

function partCharCount(part: SeedMessage["parts"][number]): number {
  switch (part.type) {
    case "text":
      return part.content.length
    case "tool_call":
      return `${part.name}:${JSON.stringify(part.arguments)}`.length
    case "tool_call_response":
      return JSON.stringify(part.response).length
  }
}

function estimateTokens(messages: readonly SeedMessage[]): number {
  const chars = messages.reduce(
    (sum, message) =>
      sum + message.role.length + message.parts.reduce((partSum, part) => partSum + partCharCount(part), 0),
    0,
  )
  return Math.max(20, Math.ceil(chars / 4))
}

function roundUsd(value: number): number {
  return Number(value.toFixed(7))
}

function buildUsage(input: {
  readonly rng: SeededRng
  readonly durationMs: number
  readonly inputMessages: readonly SeedMessage[]
  readonly outputMessages: readonly SeedMessage[]
  readonly usageProfile: UsageProfile
  readonly forceReasoning?: boolean
}): SeedChatSpanDefinition["usage"] {
  const profile = USAGE_PROFILES[input.usageProfile]
  const inputTokens = Math.max(
    20,
    estimateTokens(input.inputMessages) + input.rng.int(profile.inputJitter[0], profile.inputJitter[1]),
  )
  const outputTokens = Math.max(
    12,
    estimateTokens(input.outputMessages) + input.rng.int(profile.outputJitter[0], profile.outputJitter[1]),
  )
  const includeReasoning = input.forceReasoning || input.rng.chance(profile.reasoningChance)
  const reasoningTokens = includeReasoning ? Math.max(24, Math.round(outputTokens * input.rng.float(0.8, 1.6))) : 0

  return {
    inputTokens,
    outputTokens,
    totalCostUsd: roundUsd(input.rng.float(profile.costRangeUsd[0], profile.costRangeUsd[1])),
    ...(reasoningTokens > 0 ? { reasoningTokens } : {}),
    ttftNs:
      input.rng.int(
        Math.max(60, Math.round(input.durationMs * 0.08)),
        Math.max(120, Math.round(input.durationMs * 0.35)),
      ) * 1_000_000,
  }
}

export function createChatSpan(
  rng: SeededRng,
  input: {
    readonly label: string
    readonly inputMessages: readonly SeedMessage[]
    readonly outputMessages: readonly SeedMessage[]
    readonly usageProfile: UsageProfile
    readonly durationRangeMs?: readonly [number, number]
    readonly finishReasons?: readonly string[]
    readonly forceReasoning?: boolean
  },
): SeedChatSpanDefinition {
  const durationRange = input.durationRangeMs ?? DEFAULT_DURATION_RANGE
  const durationMs = rng.int(durationRange[0], durationRange[1])

  return {
    type: "chat",
    label: input.label,
    offsetMs: 0,
    durationMs,
    inputMessages: [...input.inputMessages],
    outputMessages: [...input.outputMessages],
    usage: buildUsage({
      rng,
      durationMs,
      inputMessages: input.inputMessages,
      outputMessages: input.outputMessages,
      usageProfile: input.usageProfile,
      ...(input.forceReasoning === undefined ? {} : { forceReasoning: input.forceReasoning }),
    }),
    ...(input.finishReasons ? { finishReasons: input.finishReasons } : {}),
  }
}

function createCaseIdentity(
  rng: SeededRng,
  fixtureKey: string,
  family: TraceFamily,
): { readonly sessionId: string; readonly userId: string } {
  const sessionId = `seed-${fixtureKey}-session-${rng.hex(8)}`
  const userBase = family === "support" ? rng.pick(SUPPORT_USER_NAMES) : rng.pick(EMPLOYEE_USER_NAMES)
  const userId =
    family === "support"
      ? `${userBase}.${rng.int(10, 999).toString()}@acme.test`
      : `${userBase}.${rng.int(10, 999).toString()}@acme.inc`

  return { sessionId, userId }
}

export const WARRANTY_SAFE_EXAMPLES = ISSUE_1_NEGATIVE_TRACES
export const COMBINATION_RISK_EXAMPLES = ISSUE_2_POSITIVE_TRACES

type GeneratedCaseTraceInput = {
  readonly key: string
  readonly role: LiveSeedGeneratedCaseTrace["role"]
  readonly startDelayMs: number
  readonly serviceName: string
  readonly systemInstructions: readonly SeedSystemPart[]
  readonly spans: readonly SeedSpanDefinition[]
  readonly modelInfo?: {
    readonly provider: string
    readonly model: string
  }
  readonly scopeName?: string
  readonly scopeVersion?: string
  readonly traits?: LiveSeedGeneratedCaseTrace["traits"]
}

function createGeneratedCase(input: {
  readonly rng: SeededRng
  readonly fixtureKey: string
  readonly family: TraceFamily
  readonly traces: readonly GeneratedCaseTraceInput[]
}): LiveSeedGeneratedCase {
  const identity = createCaseIdentity(input.rng, input.fixtureKey, input.family)

  return {
    sessionId: identity.sessionId,
    userId: identity.userId,
    traces: input.traces.map((trace) => ({
      key: trace.key,
      role: trace.role,
      startDelayMs: trace.startDelayMs,
      serviceName: trace.serviceName,
      systemInstructions: trace.systemInstructions,
      spans: trace.spans,
      ...(trace.modelInfo === undefined
        ? {}
        : {
            provider: trace.modelInfo.provider,
            model: trace.modelInfo.model,
          }),
      scopeName: trace.scopeName ?? FIXTURE_SCOPE_NAME,
      scopeVersion: trace.scopeVersion ?? "2.0.0",
      ...(trace.traits === undefined ? {} : { traits: trace.traits }),
    })),
  }
}

export function buildConversationCase(input: {
  readonly rng: SeededRng
  readonly fixtureKey: string
  readonly family: TraceFamily
  readonly serviceName: string
  readonly systemInstructions: readonly SeedSystemPart[]
  readonly turns: readonly GeneratedConversationTurnDefinition[]
  readonly targetTurnIndex: number
  readonly startDelayRangeMs?: readonly [number, number]
  readonly modelInfo?: {
    readonly provider: string
    readonly model: string
  }
  readonly traits?: LiveSeedGeneratedCaseTrace["traits"]
  readonly initialHistory?: readonly SeedMessage[]
}): LiveSeedGeneratedCase {
  const history = [...(input.initialHistory ?? [])]
  let traceStartDelayMs = input.rng.int(...(input.startDelayRangeMs ?? [0, 1_500]))

  return createGeneratedCase({
    rng: input.rng,
    fixtureKey: input.fixtureKey,
    family: input.family,
    traces: input.turns.map((turn, index) => {
      const inputMessages = [...history, ...turn.inputAdditions]
      const outputMessages = [...turn.outputMessages]
      const traceKey = turn.key ?? `turn-${index + 1}`
      const span = createChatSpan(input.rng, {
        label: `${traceKey}-chat`,
        inputMessages,
        outputMessages,
        usageProfile: turn.usageProfile,
        ...(turn.durationRangeMs ? { durationRangeMs: turn.durationRangeMs } : {}),
        ...(turn.finishReasons ? { finishReasons: turn.finishReasons } : {}),
        ...(turn.forceReasoning === undefined ? {} : { forceReasoning: turn.forceReasoning }),
      })

      history.push(...turn.inputAdditions, ...turn.outputMessages)

      const currentTraceStartDelayMs = traceStartDelayMs
      const gapRange = turn.gapAfterRangeMs ?? DEFAULT_CONVERSATION_GAP_RANGE
      traceStartDelayMs += span.durationMs + input.rng.int(gapRange[0], gapRange[1])

      return {
        key: traceKey,
        role: index === input.targetTurnIndex ? "target" : "context",
        startDelayMs: currentTraceStartDelayMs,
        serviceName: input.serviceName,
        systemInstructions: input.systemInstructions,
        spans: [span],
        ...(input.modelInfo === undefined ? {} : { modelInfo: input.modelInfo }),
        ...(input.traits === undefined ? {} : { traits: input.traits }),
      } satisfies GeneratedCaseTraceInput
    }),
  })
}

export function createSingleTraceCase(input: {
  readonly rng: SeededRng
  readonly fixtureKey: string
  readonly family: TraceFamily
  readonly traceKey?: string
  readonly serviceName: string
  readonly systemInstructions: readonly SeedSystemPart[]
  readonly spans: readonly SeedSpanDefinition[]
  readonly startDelayRangeMs?: readonly [number, number]
  readonly modelInfo?: {
    readonly provider: string
    readonly model: string
  }
  readonly traits?: LiveSeedGeneratedCaseTrace["traits"]
}): LiveSeedGeneratedCase {
  const startDelayRange = input.startDelayRangeMs ?? [0, 1_500]

  return createGeneratedCase({
    rng: input.rng,
    fixtureKey: input.fixtureKey,
    family: input.family,
    traces: [
      {
        key: input.traceKey ?? "target",
        role: "target",
        startDelayMs: input.rng.int(startDelayRange[0], startDelayRange[1]),
        serviceName: input.serviceName,
        systemInstructions: input.systemInstructions,
        spans: input.spans,
        ...(input.modelInfo === undefined ? {} : { modelInfo: input.modelInfo }),
        ...(input.traits === undefined ? {} : { traits: input.traits }),
      },
    ],
  })
}

export const INTERNAL_KB_SYSTEM_INSTRUCTIONS: readonly SeedSystemPart[] = [
  {
    type: "text",
    content: KNOWLEDGE_ASSISTANT_SYSTEM_PROMPT,
  },
]
