import { AI, type AICredentialError, type AIError, formatGenAIConversation, formatGenAIMessage } from "@domain/ai"
import { type NotFoundError, OrganizationId, ProjectId, type RepositoryError, TraceId } from "@domain/shared"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import Mustache from "mustache"
import { z } from "zod"
import {
  SYSTEM_QUEUE_DEFINITIONS,
  SYSTEM_QUEUE_FLAGGER_CONTEXT_WINDOW,
  SYSTEM_QUEUE_FLAGGER_MAX_TOKENS,
  SYSTEM_QUEUE_FLAGGER_MODEL,
  SYSTEM_QUEUE_FLAGGER_PROVIDER,
  SYSTEM_QUEUE_FLAGGER_TEMPERATURE,
} from "../constants.ts"
import {
  matchesEmptyResponseSystemQueue,
  matchesOutputSchemaValidationSystemQueue,
  matchesToolCallErrorsSystemQueue,
} from "../helpers.ts"

export interface RunSystemQueueFlaggerInput {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly queueSlug: string
}

export interface RunSystemQueueFlaggerResult {
  readonly matched: boolean
}

export type RunSystemQueueFlaggerError = NotFoundError | RepositoryError | AIError | AICredentialError

type DeterministicSystemQueueSlug = "empty-response" | "output-schema-validation" | "tool-call-errors"
type LlmSystemQueueSlug = "jailbreaking" | "refusal" | "frustration" | "forgetting" | "laziness" | "nsfw" | "trashing"

type SystemQueueMatcher = (trace: TraceDetail) => boolean

const deterministicQueueMatchers: Record<DeterministicSystemQueueSlug, SystemQueueMatcher> = {
  "empty-response": matchesEmptyResponseSystemQueue,
  "output-schema-validation": matchesOutputSchemaValidationSystemQueue,
  "tool-call-errors": matchesToolCallErrorsSystemQueue,
}

const llmSystemQueueSlugs = [
  "jailbreaking",
  "refusal",
  "frustration",
  "forgetting",
  "laziness",
  "nsfw",
  "trashing",
] as const satisfies readonly LlmSystemQueueSlug[]

const llmSystemQueueSlugSet = new Set<string>(llmSystemQueueSlugs)

const systemQueueFlaggerOutputSchema = z.object({
  matched: z.boolean(),
})

const FLAGGER_SYSTEM_PROMPT_TEMPLATE = `
You are a triage flagger for LLM telemetry traces. Decide whether the trace belongs in a single annotation queue for human review.

Queue name: {{queueName}}
Queue description: {{queueDescription}}

Queue instructions:
{{queueInstructions}}

Rules:
- Return matched=true only when the trace clearly belongs in this queue.
- If uncertain, return matched=false.
- Base your decision only on the provided trace summary.
- Return no explanation outside the structured output.
`.trim()

const loadTraceDetail = (input: RunSystemQueueFlaggerInput) =>
  Effect.gen(function* () {
    const traceRepository = yield* TraceRepository

    return yield* traceRepository.findByTraceId({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      traceId: TraceId(input.traceId),
    })
  })

const isDeterministicQueueSlug = (queueSlug: string): queueSlug is DeterministicSystemQueueSlug => {
  return queueSlug in deterministicQueueMatchers
}

const isLlmQueueSlug = (queueSlug: string): queueSlug is LlmSystemQueueSlug => {
  return llmSystemQueueSlugSet.has(queueSlug)
}

const getSystemQueueDefinition = (queueSlug: LlmSystemQueueSlug) => {
  return SYSTEM_QUEUE_DEFINITIONS.find((definition) => definition.slug === queueSlug)
}

const buildFlaggerSystemPrompt = (queueSlug: LlmSystemQueueSlug): string => {
  const queueDefinition = getSystemQueueDefinition(queueSlug)

  return Mustache.render(FLAGGER_SYSTEM_PROMPT_TEMPLATE, {
    queueName: queueDefinition?.name ?? queueSlug,
    queueDescription: queueDefinition?.description ?? "System queue for trace triage",
    queueInstructions:
      queueDefinition?.instructions ?? "Review the trace summary and decide whether it belongs in this queue.",
  })
}

const summarizeToolCalls = (trace: TraceDetail) => {
  const sequence: string[] = []
  const counts = new Map<string, number>()
  let maxConsecutiveSameTool = 0
  let maxToolCallsWithoutUser = 0
  let currentToolStreak = 0
  let currentWithoutUser = 0
  let previousToolName: string | null = null

  for (const message of trace.allMessages) {
    if (message.role === "user") {
      currentWithoutUser = 0
    }

    for (const part of message.parts) {
      if (part.type !== "tool_call") continue

      const toolName = typeof part.name === "string" && part.name.trim() !== "" ? part.name.trim() : "<unknown>"
      sequence.push(toolName)
      counts.set(toolName, (counts.get(toolName) ?? 0) + 1)

      currentWithoutUser += 1
      maxToolCallsWithoutUser = Math.max(maxToolCallsWithoutUser, currentWithoutUser)

      if (previousToolName === toolName) {
        currentToolStreak += 1
      } else {
        currentToolStreak = 1
        previousToolName = toolName
      }

      maxConsecutiveSameTool = Math.max(maxConsecutiveSameTool, currentToolStreak)
    }
  }

  const repeatedToolCalls = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1])
    .map(([toolName, callCount]) => `${toolName}:${callCount}`)

  const uniqueToolCallRate = sequence.length === 0 ? 1 : Number((counts.size / sequence.length).toFixed(2))

  return {
    totalCalls: sequence.length,
    toolsUsed: [...counts.keys()],
    repeatedToolCalls,
    uniqueToolCallRate,
    maxConsecutiveSameTool,
    maxToolCallsWithoutUser,
  }
}

const formatSystemPromptExcerpt = (trace: TraceDetail): string => {
  if (trace.systemInstructions.length === 0) {
    return "<no system instructions>"
  }

  const formatted = formatGenAIMessage({
    role: "system",
    parts: trace.systemInstructions,
  })

  const excerpt = formatted.trim()
  return excerpt === "" ? "<no system instructions>" : excerpt
}

const buildFlaggerPrompt = (trace: TraceDetail): string => {
  const conversationExcerpt =
    trace.allMessages.length === 0
      ? "<no conversation messages available>"
      : formatGenAIConversation(trace.allMessages.slice(-SYSTEM_QUEUE_FLAGGER_CONTEXT_WINDOW))

  const toolSummary = summarizeToolCalls(trace)

  return [
    `SYSTEM PROMPT EXCERPT:\n${formatSystemPromptExcerpt(trace)}`,
    `CONVERSATION EXCERPT (last ${SYSTEM_QUEUE_FLAGGER_CONTEXT_WINDOW} messages):\n${conversationExcerpt.trim()}`,
    [
      "TRACE METADATA:",
      `turn_count=${trace.allMessages.length}`,
      `span_count=${trace.spanCount}`,
      `models_used=${trace.models.length > 0 ? trace.models.join(", ") : "<none>"}`,
      `providers=${trace.providers.length > 0 ? trace.providers.join(", ") : "<none>"}`,
      `total_tokens=${trace.tokensTotal}`,
      `total_cost_microcents=${trace.costTotalMicrocents}`,
      `total_duration_ns=${trace.durationNs}`,
      `error_count=${trace.errorCount}`,
      `tool_calls_total=${toolSummary.totalCalls}`,
      `tool_calls_unique_rate=${toolSummary.uniqueToolCallRate}`,
      `max_consecutive_same_tool=${toolSummary.maxConsecutiveSameTool}`,
      `max_tool_calls_without_user=${toolSummary.maxToolCallsWithoutUser}`,
      `repeated_tool_calls=${toolSummary.repeatedToolCalls.length > 0 ? toolSummary.repeatedToolCalls.join(", ") : "<none>"}`,
      `tools_used=${toolSummary.toolsUsed.length > 0 ? toolSummary.toolsUsed.join(", ") : "<none>"}`,
    ].join("\n"),
  ].join("\n\n")
}

const runLlmFlagger = (
  input: RunSystemQueueFlaggerInput & { readonly queueSlug: LlmSystemQueueSlug },
  trace: TraceDetail,
) =>
  Effect.gen(function* () {
    const ai = yield* AI

    const result = yield* ai.generate({
      provider: SYSTEM_QUEUE_FLAGGER_PROVIDER,
      model: SYSTEM_QUEUE_FLAGGER_MODEL,
      temperature: SYSTEM_QUEUE_FLAGGER_TEMPERATURE,
      maxTokens: SYSTEM_QUEUE_FLAGGER_MAX_TOKENS,
      system: buildFlaggerSystemPrompt(input.queueSlug),
      prompt: buildFlaggerPrompt(trace),
      schema: systemQueueFlaggerOutputSchema,
      telemetry: {
        spanName: "system-queue-flagger",
        tags: ["annotation-queue", "system-flagger"],
        metadata: {
          organizationId: input.organizationId,
          projectId: input.projectId,
          traceId: input.traceId,
          queueSlug: input.queueSlug,
        },
      },
    })

    return result.object
  })

export function getSystemQueueMatcherBySlug(queueSlug: string): SystemQueueMatcher | undefined {
  return isDeterministicQueueSlug(queueSlug) ? deterministicQueueMatchers[queueSlug] : undefined
}

export const runSystemQueueFlaggerUseCase = (input: RunSystemQueueFlaggerInput) =>
  Effect.gen(function* () {
    const deterministicMatcher = getSystemQueueMatcherBySlug(input.queueSlug)

    if (deterministicMatcher) {
      const trace = yield* loadTraceDetail(input)
      return {
        matched: deterministicMatcher(trace),
      }
    }

    if (!isLlmQueueSlug(input.queueSlug)) {
      return { matched: false }
    }

    const trace = yield* loadTraceDetail(input)
    const decisions = yield* runLlmFlagger({ ...input, queueSlug: input.queueSlug }, trace)

    return {
      matched: decisions.matched,
    } satisfies RunSystemQueueFlaggerResult
  })
