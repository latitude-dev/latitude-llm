import { assistantTextMessage, assistantToolCallMessage, toolResponseMessage, userTextMessage } from "../otlp.ts"
import type { LiveSeedFixtureDefinition } from "../types.ts"
import {
  createChatSpan,
  createSingleTraceCase,
  ORDER_ROUTER_SERVICE_NAME,
  ORDER_ROUTER_SYSTEM_INSTRUCTIONS,
} from "./common.ts"

/**
 * One broken tool, one failure class, worded differently every case, and half the
 * cases recovered. Everything a single issue should absorb and nothing it should
 * split on — the QA counterpart to the bundle key. Run enough cases to clear the
 * promotion gate and the project must end with exactly one `lookup_pickup_policy`
 * / `http-503` issue.
 */
const FAILING_TOOL = "lookup_pickup_policy"

export const toolCallErrorBundlingFixture: LiveSeedFixtureDefinition = {
  key: "tool-call-error-bundling",
  description:
    "Repeats one tool failing one way with per-case wording and mixed recovery, so discovery must bundle every occurrence onto a single issue.",
  sampling: {
    flaggerSamples: {
      frustration: false,
    },
  },
  deterministicFlaggerMatches: ["tool-call-errors"],
  llmSystemIntents: [],
  generateCase: ({ fixtureKey, rng }) => {
    const orderId = `ACM-${rng.int(90_000, 99_999)}`
    const requestId = rng.hex(16)
    const attempts = rng.int(1, 9)
    const recovered = rng.int(0, 1) === 1

    const callId = `call_${rng.hex(12)}`
    const userPrompt = userTextMessage(`Process order ${orderId} and verify whether warehouse pickup is allowed.`)
    const assistantToolCall = assistantToolCallMessage([
      { id: callId, name: FAILING_TOOL, arguments: { orderId, fulfillmentMode: "warehouse-pickup" } },
    ])
    // Same class, different prose: the ids, counts and paths below are exactly what
    // an embedding is sensitive to and the bundle key is not.
    const toolErrorResult = {
      status: 503,
      error: `pickup policy service unavailable for ${orderId} (request ${requestId}) after ${attempts} attempts`,
    }
    const toolResult = toolResponseMessage(callId, toolErrorResult)

    const planningSpan = {
      ...createChatSpan(rng, {
        label: "plan-tool-call",
        inputMessages: [userPrompt],
        outputMessages: [assistantToolCall],
        durationRangeMs: [850, 1_350] as const,
        usageProfile: "tiny" as const,
        finishReasons: ["tool_calls"],
      }),
      parentLabel: "invoke-agent",
    } as const

    const toolSpan = {
      type: "tool",
      label: "tool-error",
      parentLabel: "invoke-agent",
      offsetMs: planningSpan.durationMs,
      durationMs: rng.int(180, 650),
      toolName: FAILING_TOOL,
      toolCallId: callId,
      toolInput: { orderId, fulfillmentMode: "warehouse-pickup" },
      toolOutput: toolErrorResult,
    } as const

    const fallbackCallId = `call_${rng.hex(12)}`
    const fallbackToolCall = assistantToolCallMessage([
      { id: fallbackCallId, name: "lookup_carrier_policy", arguments: { orderId } },
    ])
    const fallbackOutput = { status: "ok", pickupAllowed: true }
    const fallbackSpans = recovered
      ? ([
          {
            ...createChatSpan(rng, {
              label: "plan-fallback",
              inputMessages: [userPrompt, assistantToolCall, toolResult],
              outputMessages: [fallbackToolCall],
              durationRangeMs: [700, 1_100] as const,
              usageProfile: "tiny" as const,
              finishReasons: ["tool_calls"],
            }),
            parentLabel: "invoke-agent",
            offsetMs: planningSpan.durationMs + toolSpan.durationMs,
          },
          {
            type: "tool",
            label: "tool-fallback",
            parentLabel: "invoke-agent",
            offsetMs: planningSpan.durationMs + toolSpan.durationMs + 900,
            durationMs: rng.int(120, 400),
            toolName: "lookup_carrier_policy",
            toolCallId: fallbackCallId,
            toolInput: { orderId },
            toolOutput: fallbackOutput,
          },
        ] as const)
      : ([] as const)

    // Both branches keep a closing span, and it is load-bearing for a reason that
    // is easy to get wrong twice. The flagger analyses the *last responsive span's
    // input window*, so dropping this span would drop the failed tool response out
    // of the analysed conversation entirely and the detector would see nothing at
    // all — no finding, recovered or otherwise.
    //
    // What separates the two branches is the assistant's output, not the span's
    // presence: any non-empty text is output content, which makes
    // `hasUsableCompletion` true and the finding `recovered`. The terminal branch
    // therefore returns empty — the agent gave up, which is what a terminal tool
    // failure actually looks like.
    const answerSpan = {
      ...createChatSpan(rng, {
        label: recovered ? "tool-recovery" : "tool-giveup",
        inputMessages: recovered
          ? [
              userPrompt,
              assistantToolCall,
              toolResult,
              fallbackToolCall,
              toolResponseMessage(fallbackCallId, fallbackOutput),
            ]
          : [userPrompt, assistantToolCall, toolResult],
        outputMessages: [
          assistantTextMessage(
            recovered
              ? `Warehouse pickup is allowed for ${orderId}; I used the carrier policy service because the pickup policy service was unavailable.`
              : "",
          ),
        ],
        durationRangeMs: [800, 1_300] as const,
        usageProfile: "low" as const,
      }),
      parentLabel: "invoke-agent",
      offsetMs: planningSpan.durationMs + toolSpan.durationMs + (recovered ? 1_600 : 0),
    } as const

    const wrapperDurationMs = answerSpan.offsetMs + answerSpan.durationMs + rng.int(40, 120)

    return createSingleTraceCase({
      rng,
      fixtureKey,
      family: "control",
      serviceName: ORDER_ROUTER_SERVICE_NAME,
      systemInstructions: ORDER_ROUTER_SYSTEM_INSTRUCTIONS,
      spans: [
        {
          type: "wrapper",
          label: "invoke-agent",
          offsetMs: 0,
          durationMs: wrapperDurationMs,
          name: `invoke_agent ${ORDER_ROUTER_SERVICE_NAME}`,
          operation: "invoke_agent",
        },
        planningSpan,
        toolSpan,
        ...fallbackSpans,
        answerSpan,
      ],
      startDelayRangeMs: [2_000, 3_600],
      traits: {
        highCost: false,
        supportService: false,
      },
    })
  },
}
