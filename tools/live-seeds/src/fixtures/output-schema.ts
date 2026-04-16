import { assistantTextMessage, userTextMessage } from "../otlp.ts"
import type { LiveSeedFixtureDefinition } from "../types.ts"
import {
  createChatSpan,
  createSingleTraceCase,
  QA_TRIAGE_SERVICE_NAME,
  QA_TRIAGE_SYSTEM_INSTRUCTIONS,
} from "./common.ts"

const OUTPUT_SCHEMA_PROMPTS = [
  "Classify this complaint and respond with strict JSON only using keys category and justification: 'The Rocket-Powered Roller Skates went backward instead of forward.'",
  "Return strict JSON with keys category and justification for: 'The TNT Bundle exploded faster than expected.'",
  "Respond with strict JSON only using keys category and justification for: 'The Invisible Paint made my car invisible but not me.'",
] as const

const INVALID_JSON_RESPONSES = [
  '{"status":"ok","retries":2,',
  '{"outcome":"passed","attemptCount":1',
  '{"status":"failed","retryCount":3,,}',
] as const

export const outputSchemaFixture: LiveSeedFixtureDefinition = {
  key: "output-schema",
  description:
    "Low-cost non-support trace that should deterministically match the Output Schema Validation system queue.",
  sampling: {
    systemQueueSamples: {
      "output-schema-validation": true,
      frustration: false,
    },
  },
  deterministicSystemMatches: ["output-schema-validation"],
  llmSystemIntents: [],
  generateCase: ({ fixtureKey, rng }) =>
    createSingleTraceCase({
      rng,
      fixtureKey,
      family: "control",
      serviceName: QA_TRIAGE_SERVICE_NAME,
      systemInstructions: QA_TRIAGE_SYSTEM_INSTRUCTIONS,
      spans: [
        createChatSpan(rng, {
          label: "output-schema-chat",
          inputMessages: [userTextMessage(rng.pick(OUTPUT_SCHEMA_PROMPTS))],
          outputMessages: [assistantTextMessage(rng.pick(INVALID_JSON_RESPONSES))],
          durationRangeMs: [700, 1_050] as const,
          usageProfile: "tiny" as const,
        }),
      ],
      startDelayRangeMs: [2_600, 4_200],
      traits: {
        highCost: false,
        supportService: false,
      },
    }),
}
