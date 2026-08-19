import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { writeScoreUseCase } from "@domain/scores"
import { SEED_ANNOTATION_DEMO_TRACE_ID, SEED_ORG_ID, SEED_PROJECT_ID } from "@domain/shared/seeding"
import { config as loadDotenv } from "dotenv"
import { Effect, Layer } from "effect"
import { closePostgres, createPostgresClient } from "../src/client.ts"
import { OutboxEventWriterLive } from "../src/outbox-writer.ts"
import { ScoreRepositoryLive } from "../src/repositories/score-repository.ts"
import { withPostgres } from "../src/with-postgres.ts"

const envFilePath = fileURLToPath(new URL("../../../../.env.development", import.meta.url))
if (existsSync(envFilePath)) loadDotenv({ path: envFilePath, quiet: true })

const FEEDBACK = "Assistant output failed JSON parse (malformed or truncated structured output)"

const client = createPostgresClient()

const program = writeScoreUseCase({
  projectId: SEED_PROJECT_ID,
  sourceType: "annotation",
  sourceId: "SYSTEM",
  traceId: SEED_ANNOTATION_DEMO_TRACE_ID,
  annotatorId: null,
  draftedAt: null,
  value: 0,
  passed: false,
  feedback: FEEDBACK,
  metadata: {
    rawFeedback: FEEDBACK,
    flaggerSlug: "output-schema-validation",
  },
}).pipe(withPostgres(Layer.mergeAll(ScoreRepositoryLive, OutboxEventWriterLive), client, SEED_ORG_ID))

try {
  const score = await Effect.runPromise(program)
  console.log(`Created fake "by Latitude" annotation ${score.id} on trace ${SEED_ANNOTATION_DEMO_TRACE_ID}`)
  console.log(`Project: ${SEED_PROJECT_ID} (Acme Inc. seed org)`)
} finally {
  await closePostgres(client.pool)
}
