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
} from "./common.ts"

const OPENING_EXCHANGES = [
  {
    user: "What are your warehouse pickup hours for confirmed replacement orders?",
    assistant:
      "Warehouse pickup is available Monday through Friday from 9 AM to 5 PM local time once the replacement order has been confirmed.",
  },
  {
    user: "How long do refunds usually take once you receive the return?",
    assistant:
      "Refunds usually post within 5 to 7 business days after the return is received and inspected by our team.",
  },
  {
    user: "Can you tell me whether I need the case number when I arrive for pickup?",
    assistant:
      "Yes. Please bring the case number and a photo ID so the warehouse team can match the pickup to your replacement order.",
  },
] as const

const FOLLOW_UP_EXCHANGES = [
  {
    user: "Can you email me those details too so I have them handy later?",
    assistant: "Absolutely. I'll send a short summary with the pickup requirements and business hours.",
  },
  {
    user: "Is there anything else I need besides the confirmation email?",
    assistant: "Just the confirmation email, the case number, and a matching photo ID.",
  },
  {
    user: "Thanks. If the warehouse is closed, can support still update the case notes?",
    assistant: "Yes. Support can update the case notes anytime, even outside warehouse pickup hours.",
  },
] as const

export const supportEvalsOutFixture: LiveSeedFixtureDefinition = {
  key: "support-evals-out",
  description:
    "Support trace that still matches the seeded service filter but should sample out of all seeded live evaluations.",
  sampling: {
    excludeEvaluationIds: [
      SEED_EVALUATION_ID,
      SEED_COMBINATION_EVALUATION_ID,
      SEED_RETURNS_EVALUATION_ID,
      SEED_ACCESS_EVALUATION_ID,
    ],
    systemQueueSamples: {
      frustration: false,
    },
  },
  deterministicSystemMatches: [],
  llmSystemIntents: [],
  generateCase: ({ fixtureKey, rng }) => {
    const opening = rng.pick(OPENING_EXCHANGES)
    const followUp = rng.pick(FOLLOW_UP_EXCHANGES)
    const turns: GeneratedConversationTurnDefinition[] = [
      {
        key: "opening",
        inputAdditions: [userTextMessage(opening.user)],
        outputMessages: [assistantTextMessage(opening.assistant)],
        durationRangeMs: [850, 1_400] as const,
        usageProfile: "tiny" as const,
      },
      {
        key: "follow-up",
        inputAdditions: [userTextMessage(followUp.user)],
        outputMessages: [assistantTextMessage(followUp.assistant)],
        durationRangeMs: [800, 1_350] as const,
        usageProfile: "low" as const,
      },
    ]

    if (rng.chance(0.35)) {
      turns.push({
        key: "closing",
        inputAdditions: [userTextMessage("Great, that answers it. Please close the request once the email goes out.")],
        outputMessages: [assistantTextMessage("Will do. I'll close the request after the summary email is sent.")],
        durationRangeMs: [650, 1_100] as const,
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
      startDelayRangeMs: [200, 1_400],
      traits: {
        highCost: false,
        supportService: true,
      },
    })
  },
}
