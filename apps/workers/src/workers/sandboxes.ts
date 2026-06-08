import type { QueueConsumer } from "@domain/queue"
import { archiveIdleSandboxesUseCase } from "@domain/sandboxes"
import { type PostgresClient, SandboxRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"
import { getAdminPostgresClient } from "../clients.ts"

const logger = createLogger("sandboxes")

interface SandboxesDeps {
  consumer: QueueConsumer
  adminPostgresClient?: PostgresClient
}

export const createSandboxesWorker = ({ consumer, adminPostgresClient }: SandboxesDeps) => {
  const adminPgClient = adminPostgresClient ?? getAdminPostgresClient()

  consumer.subscribe("sandboxes", {
    archiveIdle: () =>
      archiveIdleSandboxesUseCase().pipe(
        withPostgres(SandboxRepositoryLive, adminPgClient),
        Effect.tap((result) => Effect.sync(() => logger.info(`Sandbox idle sweep: archived=${result.archived}`))),
        Effect.tapError((error) => Effect.sync(() => logger.error("Sandbox idle sweep failed", error))),
        withTracing,
        Effect.asVoid,
      ),
  })
}
