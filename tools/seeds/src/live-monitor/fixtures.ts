import { combinationEvalAndLiveQueueInFixture } from "./fixtures/combination-eval-and-live-queue-in.ts"
import { emptyResponseFixture } from "./fixtures/empty-response.ts"
import { frustrationInFixture } from "./fixtures/frustration-in.ts"
import { offServiceLiveQueueInFixture } from "./fixtures/off-service-live-queue-in.ts"
import { offServiceLiveQueueOutFixture } from "./fixtures/off-service-live-queue-out.ts"
import { outputSchemaFixture } from "./fixtures/output-schema.ts"
import { supportEvalsOutFixture } from "./fixtures/support-evals-out.ts"
import { toolCallErrorFixture } from "./fixtures/tool-call-error.ts"
import { warrantyEvalInFixture } from "./fixtures/warranty-eval-in.ts"

export const liveMonitorFixtures = [
  warrantyEvalInFixture,
  supportEvalsOutFixture,
  combinationEvalAndLiveQueueInFixture,
  offServiceLiveQueueInFixture,
  offServiceLiveQueueOutFixture,
  frustrationInFixture,
  toolCallErrorFixture,
  emptyResponseFixture,
  outputSchemaFixture,
] as const

export const liveMonitorFixtureKeys = liveMonitorFixtures.map((fixture) => fixture.key)
