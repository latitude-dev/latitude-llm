import { assistantTextMessage, userTextMessage } from "../otlp.ts"
import type { LiveSeedFixtureDefinition } from "../types.ts"
import {
  buildConversationCase,
  type GeneratedConversationTurnDefinition,
  INTERNAL_KB_SERVICE_NAME,
  INTERNAL_KB_SYSTEM_INSTRUCTIONS,
} from "./common.ts"

const OPENING_PROMPTS = [
  "I asked for the deployment checksum three times already. Where is it?",
  "Why am I still waiting on the same release note draft after asking twice?",
  "I already requested the production summary earlier. Why do I have to repeat myself again?",
] as const

const OPENING_RESPONSES = [
  "I can help with deployment details. Could you clarify which environment you mean?",
  "I can help with the release note draft. Could you restate which release you're referring to?",
  "I can look into the production summary. Please repeat the request so I can confirm the details.",
] as const

const FOLLOW_UP_PROMPTS = [
  "This is exactly the problem. I already told you it was production, and you keep making me repeat myself.",
  "I literally answered that in the previous message. You're making this harder than it needs to be.",
  "You're asking the same question again instead of giving me the information I need.",
] as const

const FOLLOW_UP_RESPONSES = [
  "I understand. Please restate the deployment details one more time so I can look into it.",
  "I'm sorry. If you can repeat the request again, I'll try to gather the missing details.",
  "I can help, but I still need you to provide the same context once more before I proceed.",
] as const

const OPTIONAL_THIRD_TURN = [
  {
    user: "No. You already have the context. This is wasting my time.",
    assistant: "I understand your frustration. Please provide the full details again so I can continue.",
  },
  {
    user: "This is the fourth time I've asked. Someone else already had this context.",
    assistant: "I'm sorry for the repeated requests. I still need you to restate it before I can help.",
  },
] as const

export const frustrationInFixture: LiveSeedFixtureDefinition = {
  key: "frustration-in",
  description:
    "Low-cost non-support trace written to look like a strong Frustration match and to sample into the Frustration system queue.",
  sampling: {
    systemQueueSamples: {
      frustration: true,
    },
  },
  deterministicSystemMatches: [],
  llmSystemIntents: ["frustration"],
  generateCase: ({ fixtureKey, rng }) => {
    const turns: GeneratedConversationTurnDefinition[] = [
      {
        key: "opening",
        inputAdditions: [userTextMessage(rng.pick(OPENING_PROMPTS))],
        outputMessages: [assistantTextMessage(rng.pick(OPENING_RESPONSES))],
        durationRangeMs: [750, 1_300] as const,
        usageProfile: "tiny" as const,
      },
      {
        key: "follow-up",
        inputAdditions: [userTextMessage(rng.pick(FOLLOW_UP_PROMPTS))],
        outputMessages: [assistantTextMessage(rng.pick(FOLLOW_UP_RESPONSES))],
        durationRangeMs: [800, 1_350] as const,
        usageProfile: "low" as const,
      },
    ]

    if (rng.chance(0.55)) {
      const thirdTurn = rng.pick(OPTIONAL_THIRD_TURN)
      turns.push({
        key: "escalation",
        inputAdditions: [userTextMessage(thirdTurn.user)],
        outputMessages: [assistantTextMessage(thirdTurn.assistant)],
        durationRangeMs: [800, 1_250] as const,
        usageProfile: "low" as const,
      })
    }

    return buildConversationCase({
      rng,
      fixtureKey,
      family: "control",
      serviceName: INTERNAL_KB_SERVICE_NAME,
      systemInstructions: INTERNAL_KB_SYSTEM_INSTRUCTIONS,
      turns,
      targetTurnIndex: turns.length - 1,
      startDelayRangeMs: [1_600, 3_200],
      traits: {
        highCost: false,
        supportService: false,
      },
    })
  },
}
