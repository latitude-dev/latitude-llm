import { assistantTextMessage, userTextMessage } from "../otlp.ts"
import type { LiveSeedFixtureDefinition } from "../types.ts"
import {
  buildTraceFromTurns,
  createGeneratedTrace,
  QA_TRIAGE_SERVICE_NAME,
  QA_TRIAGE_SYSTEM_INSTRUCTIONS,
} from "./common.ts"

const EMPTY_RESPONSE_PROMPTS = [
  "Classify: 'The anvil fell upward.'",
  "Classify: 'Product achieved sentience. Please advise.'",
  "Classify: 'Bird Seed Premium did not attract any birds. I am in the Arctic.'",
] as const

const EMPTY_RESPONSES = ["...", "...", ""] as const

export const emptyResponseFixture: LiveSeedFixtureDefinition = {
  key: "empty-response",
  description: "Low-cost non-support trace that should deterministically match the Empty Response system queue.",
  sampling: {
    systemQueueSamples: {
      "empty-response": true,
      frustration: false,
    },
  },
  deterministicSystemMatches: ["empty-response"],
  llmSystemIntents: [],
  generateTrace: ({ fixtureKey, rng }) =>
    createGeneratedTrace({
      rng,
      fixtureKey,
      family: "control",
      serviceName: QA_TRIAGE_SERVICE_NAME,
      systemInstructions: QA_TRIAGE_SYSTEM_INSTRUCTIONS,
      spans: buildTraceFromTurns(rng, [
        {
          inputAdditions: [userTextMessage(rng.pick(EMPTY_RESPONSE_PROMPTS))],
          outputMessages: [assistantTextMessage(rng.pick(EMPTY_RESPONSES))],
          durationRangeMs: [650, 1_050] as const,
          usageProfile: "tiny" as const,
        },
      ]),
      startDelayRangeMs: [2_300, 3_900],
      traits: {
        highCost: false,
        supportService: false,
      },
    }),
}
