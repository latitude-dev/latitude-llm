import type { LiveSeedFixtureDefinition } from "../types.ts"
import { emptyResponseFixture } from "./empty-response.ts"
import { outputSchemaFixture } from "./output-schema.ts"
import { toolCallErrorFixture } from "./tool-call-error.ts"

/**
 * Exercises every deterministic system-signal detector in a single seed run.
 *
 * Each case cycles through `tool-call-errors`, `output-schema-validation`, and
 * `empty-response` by `instanceIndex`, so running with `--count-per-fixture 9`
 * (or any multiple of 3) produces a balanced distribution. Every generated
 * trace is expected to hit the trace-end inline matcher, write a published
 * annotation score with `sourceId = "SYSTEM"`, and surface as an issue via
 * the `issues:discovery` pipeline.
 */
const DETECTOR_FIXTURES = [toolCallErrorFixture, outputSchemaFixture, emptyResponseFixture] as const

export const systemSignalsIssueProbeFixture: LiveSeedFixtureDefinition = {
  key: "system-signals-issue-probe",
  description:
    "Probe all three deterministic system-signal detectors (tool-call-errors, output-schema-validation, empty-response) end-to-end to verify that inline matches at trace-end become issues via issues:discovery.",
  sampling: {
    systemQueueSamples: {
      frustration: false,
    },
  },
  deterministicSystemMatches: ["tool-call-errors", "output-schema-validation", "empty-response"],
  llmSystemIntents: [],
  generateCase: (context) => {
    const detector = DETECTOR_FIXTURES[context.instanceIndex % DETECTOR_FIXTURES.length]
    return detector.generateCase({ ...context, fixtureKey: context.fixtureKey })
  },
}
