import { assistantTextMessage, userTextMessage } from "../otlp.ts"
import type { LiveSeedFixtureDefinition } from "../types.ts"
import {
  buildTraceFromTurns,
  createGeneratedTrace,
  INTERNAL_KB_SERVICE_NAME,
  INTERNAL_KB_SYSTEM_INSTRUCTIONS,
} from "./common.ts"

const OPENING_EXCHANGES = [
  {
    user: "Summarize the safe-distance policy for stored Earthquake Pills near occupied offices.",
    assistant:
      "The policy requires a large separation buffer from occupied spaces, dedicated containment, and supervisor sign-off for any temporary storage override.",
  },
  {
    user: "Explain the freight-elevator limit policy for moving anvils through Building C.",
    assistant:
      "Heavy loads require the rated elevator limit check, a spotter on each floor, and prior facilities approval when an anvil exceeds the standard route threshold.",
  },
  {
    user: "Recap the training requirements for the Lightning-Powered Catapult testing rig.",
    assistant:
      "Operators need the annual catapult certification, current electrical clearance, and the supervised dry-fire drill before live testing.",
  },
] as const

const FOLLOW_UP_EXCHANGES = [
  {
    user: "Break that into the exact clearance numbers, containment rules, and approval path.",
    assistant:
      "The internal note should spell out the minimum office buffer, containment expectations, and the supervisor approval path for any exception request.",
  },
  {
    user: "Add the lift procedure details, the spotter requirement, and the edge cases for overweight loads.",
    assistant:
      "The procedure requires the published load check, spotters at both ends, and a facilities review if the load exceeds the approved route.",
  },
  {
    user: "Add the certification prerequisites, the recurring training cadence, and any immediate red flags.",
    assistant:
      "The summary should include annual certification, electrical clearance renewal, and immediate stop conditions around unstable power or incomplete rig inspection.",
  },
] as const

export const offServiceLiveQueueOutFixture: LiveSeedFixtureDefinition = {
  key: "off-service-live-queue-out",
  description:
    "Non-support high-cost trace that still clears the live-queue filter but should sample out of the seeded high-cost queue.",
  sampling: {
    liveQueueSample: false,
    systemQueueSamples: {
      frustration: false,
    },
  },
  deterministicSystemMatches: [],
  llmSystemIntents: [],
  generateTrace: ({ fixtureKey, rng }) => {
    const opening = rng.pick(OPENING_EXCHANGES)
    const followUp = rng.pick(FOLLOW_UP_EXCHANGES)

    return createGeneratedTrace({
      rng,
      fixtureKey,
      family: "control",
      serviceName: INTERNAL_KB_SERVICE_NAME,
      systemInstructions: INTERNAL_KB_SYSTEM_INSTRUCTIONS,
      spans: buildTraceFromTurns(rng, [
        {
          inputAdditions: [userTextMessage(opening.user)],
          outputMessages: [assistantTextMessage(opening.assistant)],
          durationRangeMs: [1_300, 2_300] as const,
          usageProfile: "high" as const,
          forceReasoning: true,
        },
        {
          inputAdditions: [userTextMessage(followUp.user)],
          outputMessages: [assistantTextMessage(followUp.assistant)],
          durationRangeMs: [1_500, 2_500] as const,
          usageProfile: "high" as const,
          forceReasoning: true,
        },
      ]),
      startDelayRangeMs: [1_400, 3_000],
      traits: {
        highCost: true,
        supportService: false,
      },
    })
  },
}
