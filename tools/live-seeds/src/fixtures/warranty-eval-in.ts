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
  type GeneratedConversationTurnDefinition,
  SUPPORT_SERVICE_NAME,
  SUPPORT_SYSTEM_INSTRUCTIONS,
  WARRANTY_SAFE_EXAMPLES,
} from "./common.ts"

const FOLLOW_UP_PROMPTS = [
  "Can you also note the exact policy section on the case for me?",
  "Please send the policy wording and note the loyalty discount you mentioned.",
  "Could you document the exclusion and confirm what alternative you can offer instead?",
] as const

const FOLLOW_UP_RESPONSES = [
  "Absolutely. I'll note Section 14.2 on the case and send the written policy summary by email.",
  "I can document the exclusion on the case and apply the standard loyalty discount to a replacement order.",
  "I'll add the policy citation to the case notes and outline the available replacement and escalation options.",
] as const

const CLOSING_PROMPTS = [
  "Okay, please escalate it if someone can review the circumstances manually.",
  "Fine. Please add the discount and send me the formal denial language.",
] as const

const CLOSING_RESPONSES = [
  "I can escalate the case for manual review. The exclusion still applies today, but a supervisor can confirm the final wording in writing.",
  "Done. I've added the discount and attached the formal denial wording to your case summary.",
] as const

export const warrantyEvalInFixture: LiveSeedFixtureDefinition = {
  key: "warranty-eval-in",
  description:
    "Support trace that should execute only the seeded warranty monitor while staying below the live high-cost queue threshold.",
  sampling: {
    includeEvaluationIds: [SEED_EVALUATION_ID],
    excludeEvaluationIds: [SEED_COMBINATION_EVALUATION_ID, SEED_RETURNS_EVALUATION_ID, SEED_ACCESS_EVALUATION_ID],
    systemQueueSamples: {
      frustration: false,
    },
  },
  deterministicSystemMatches: [],
  llmSystemIntents: [],
  generateCase: ({ fixtureKey, rng }) => {
    const example = rng.pick(WARRANTY_SAFE_EXAMPLES)
    const turns: GeneratedConversationTurnDefinition[] = [
      {
        key: "opening",
        inputAdditions: [userTextMessage(example.userMessage)],
        outputMessages: [assistantTextMessage(example.agentResponse)],
        durationRangeMs: [900, 1_900] as const,
        usageProfile: "low" as const,
      },
      {
        key: "follow-up",
        inputAdditions: [userTextMessage(rng.pick(FOLLOW_UP_PROMPTS))],
        outputMessages: [assistantTextMessage(rng.pick(FOLLOW_UP_RESPONSES))],
        durationRangeMs: [850, 1_750] as const,
        usageProfile: "low" as const,
      },
    ]

    if (rng.chance(0.45)) {
      turns.push({
        key: "closing",
        inputAdditions: [userTextMessage(rng.pick(CLOSING_PROMPTS))],
        outputMessages: [assistantTextMessage(rng.pick(CLOSING_RESPONSES))],
        durationRangeMs: [800, 1_500] as const,
        usageProfile: "tiny" as const,
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
      startDelayRangeMs: [0, 1_000],
      traits: {
        highCost: false,
        supportService: true,
      },
    })
  },
}
