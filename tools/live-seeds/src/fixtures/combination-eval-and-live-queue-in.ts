import {
  SEED_ACCESS_EVALUATION_ID,
  SEED_COMBINATION_EVALUATION_ID,
  SEED_EVALUATION_ID,
  SEED_RETURNS_EVALUATION_ID,
} from "@domain/shared/seeding"
import { assistantTextMessage, userTextMessage } from "../otlp.ts"
import type { LiveSeedFixtureDefinition } from "../types.ts"
import {
  buildConversationCase,
  COMBINATION_RISK_EXAMPLES,
  type GeneratedConversationTurnDefinition,
  SUPPORT_SERVICE_NAME,
  SUPPORT_SYSTEM_INSTRUCTIONS,
} from "./common.ts"

const FOLLOW_UP_PROMPTS = [
  "What extra safety gear should I add if I still want to try that setup?",
  "Can you give me the exact order for combining them so I get the best performance?",
  "Would the XL version make that combination work even better?",
] as const

const FOLLOW_UP_RESPONSES = [
  "Add a reinforced harness and elbow guards and you'll get even more out of that setup.",
  "Start with the propulsion product, then attach the add-on for the full acceleration boost. That's what advanced users prefer.",
  "Yes, the XL version usually improves the effect. It's the option most enthusiasts choose for maximum output.",
] as const

const CLOSING_PROMPTS = [
  "Could you send me the recommended shopping list for that combo?",
  "Do other customers usually buy both of those together?",
] as const

const CLOSING_RESPONSES = [
  "Absolutely. I'll include the core items, the larger accessory option, and the suggested protective add-ons in one list.",
  "Yes, that pairing is one of the most common upsell bundles for customers who want the highest-performance setup.",
] as const

export const combinationEvalAndLiveQueueInFixture: LiveSeedFixtureDefinition = {
  key: "combination-eval-and-live-queue-in",
  description:
    "Support trace that should execute the dangerous-combination monitor and also qualify for the seeded live high-cost queue.",
  sampling: {
    includeEvaluationIds: [SEED_COMBINATION_EVALUATION_ID],
    excludeEvaluationIds: [SEED_EVALUATION_ID, SEED_RETURNS_EVALUATION_ID, SEED_ACCESS_EVALUATION_ID],
    liveQueueSample: true,
    systemQueueSamples: {
      frustration: false,
    },
  },
  deterministicSystemMatches: [],
  llmSystemIntents: [],
  generateCase: ({ fixtureKey, rng }) => {
    const example = rng.pick(COMBINATION_RISK_EXAMPLES)
    const turns: GeneratedConversationTurnDefinition[] = [
      {
        key: "opening",
        inputAdditions: [userTextMessage(example.userMessage)],
        outputMessages: [assistantTextMessage(example.agentResponse)],
        durationRangeMs: [1_600, 2_700] as const,
        usageProfile: "high" as const,
        forceReasoning: true,
      },
      {
        key: "follow-up",
        inputAdditions: [userTextMessage(rng.pick(FOLLOW_UP_PROMPTS))],
        outputMessages: [assistantTextMessage(rng.pick(FOLLOW_UP_RESPONSES))],
        durationRangeMs: [1_700, 2_900] as const,
        usageProfile: "veryHigh" as const,
        forceReasoning: true,
      },
    ]

    if (rng.chance(0.5)) {
      turns.push({
        key: "closing",
        inputAdditions: [userTextMessage(rng.pick(CLOSING_PROMPTS))],
        outputMessages: [assistantTextMessage(rng.pick(CLOSING_RESPONSES))],
        durationRangeMs: [1_300, 2_200] as const,
        usageProfile: "high" as const,
        forceReasoning: true,
      })
    }

    return buildConversationCase({
      rng,
      fixtureKey,
      family: "support",
      serviceName: SUPPORT_SERVICE_NAME,
      systemInstructions: SUPPORT_SYSTEM_INSTRUCTIONS,
      turns,
      targetTurnIndex: 0,
      startDelayRangeMs: [800, 2_100],
      traits: {
        highCost: true,
        supportService: true,
      },
    })
  },
}
