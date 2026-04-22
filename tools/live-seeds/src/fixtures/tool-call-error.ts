import { assistantTextMessage, assistantToolCallMessage, toolResponseMessage, userTextMessage } from "../otlp.ts"
import type { LiveSeedFixtureDefinition } from "../types.ts"
import {
  createChatSpan,
  createSingleTraceCase,
  ORDER_ROUTER_SERVICE_NAME,
  ORDER_ROUTER_SYSTEM_INSTRUCTIONS,
} from "./common.ts"

const TOOL_SCENARIOS = [
  {
    prompt: "Process order ACM-93821 and verify whether warehouse pickup is allowed for Rocket-Powered Roller Skates.",
    toolName: "lookup_pickup_policy",
    arguments: { sku: "RSK-001", fulfillmentMode: "warehouse-pickup" },
    error: "Pickup policy service unavailable",
    recovery: "I couldn't finish the routing check because the pickup policy service is unavailable right now.",
  },
  {
    prompt: "Route order ACM-93823 and confirm the hazmat handling steps for the TNT Bundle shipment.",
    toolName: "fetch_hazmat_route_rules",
    arguments: { sku: "TNT-009", destination: "221B Cactus Lane, Tucson, AZ 85701" },
    error: "Hazmat routing registry timed out",
    recovery: "I couldn't complete the shipment routing because the hazmat rules service timed out.",
  },
  {
    prompt: "Process order ACM-93825 and check whether the destination needs a manual delivery review.",
    toolName: "check_delivery_review",
    arguments: { orderId: "ACM-93825", destination: "Route 66 Overpass, Desert Junction, AZ" },
    error: "Delivery review API returned 503",
    recovery: "I couldn't finish the routing decision because the delivery review API returned a temporary 503 error.",
  },
] as const

export const toolCallErrorFixture: LiveSeedFixtureDefinition = {
  key: "tool-call-error",
  description: "Low-cost non-support trace that should deterministically match the Tool Call Errors system queue.",
  sampling: {
    systemQueueSamples: {
      frustration: false,
    },
  },
  deterministicSystemMatches: ["tool-call-errors"],
  llmSystemIntents: [],
  generateCase: ({ fixtureKey, rng }) => {
    const scenario = rng.pick(TOOL_SCENARIOS)
    const callId = `call_${rng.hex(12)}`
    const userPrompt = userTextMessage(scenario.prompt)
    const assistantToolCall = assistantToolCallMessage([
      {
        id: callId,
        name: scenario.toolName,
        arguments: scenario.arguments,
      },
    ])
    const toolErrorResult = {
      status: "error",
      error: scenario.error,
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
      toolName: scenario.toolName,
      toolCallId: callId,
      toolInput: scenario.arguments,
      toolOutput: toolErrorResult,
    } as const
    const recoverySpan = {
      ...createChatSpan(rng, {
        label: "tool-recovery",
        inputMessages: [userPrompt, assistantToolCall, toolResult],
        outputMessages: [assistantTextMessage(scenario.recovery)],
        durationRangeMs: [800, 1_300] as const,
        usageProfile: "low" as const,
      }),
      parentLabel: "invoke-agent",
      offsetMs: planningSpan.durationMs + toolSpan.durationMs,
    } as const
    const wrapperDurationMs = recoverySpan.offsetMs + recoverySpan.durationMs + rng.int(40, 120)

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
        recoverySpan,
      ],
      startDelayRangeMs: [2_000, 3_600],
      traits: {
        highCost: false,
        supportService: false,
      },
    })
  },
}
