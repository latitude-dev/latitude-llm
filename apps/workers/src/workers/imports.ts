import type { EventsPublisher } from "@domain/events"
import {
  createFetchPagePublisher,
  deleteProjectImportsUseCase,
  IMPORT_WORKER_CONCURRENCY,
  ImportSourceAdapters,
  processImportPageUseCase,
  recordImportFinalFailureUseCase,
  startImportUseCase,
} from "@domain/imports"
import { isSandbox, OrganizationRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import type { QueueConsumer, QueuePublishError, QueuePublisherShape } from "@domain/queue"
import { ImportJobId, OrganizationId, ProjectId, resolveRedactionPolicy } from "@domain/shared"
import { RedisCacheStoreLive, type RedisClient } from "@platform/cache-redis"
import { type ClickHouseClient, SpanRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import type { PostgresClient } from "@platform/db-postgres"
import {
  BillingOverrideRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  ImportJobRepositoryLive,
  OrganizationRepositoryLive,
  OutboxEventWriterLive,
  ProjectRepositoryLive,
  resolveEffectivePlanCached,
  resolveOrganizationRedactionCached,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { parseEnvOptional } from "@platform/env"
import { createImportAdapterRegistry } from "@platform/import-sources"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getClickhouseClient, getPostgresClient, getRedisClient } from "../clients.ts"

const logger = createLogger("imports")

interface ImportsDeps {
  consumer: QueueConsumer
  publisher: QueuePublisherShape
  eventsPublisher: EventsPublisher<QueuePublishError>
  postgresClient?: PostgresClient
  clickhouseClient?: ClickHouseClient
  redisClient?: RedisClient
}

const billingPlanLayers = Layer.mergeAll(
  BillingOverrideRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  OrganizationRepositoryLive,
  ProjectRepositoryLive,
)

// Unset degrades pseudonymized identities to full redaction rather than blocking the import.
const pseudonymSecret = Effect.runSync(parseEnvOptional("LAT_REDACTION_PSEUDONYM_SECRET", "string"))

const postgresLayers = Layer.mergeAll(ImportJobRepositoryLive, OutboxEventWriterLive)

const adapterRegistry = createImportAdapterRegistry()
const adaptersLayer = Layer.succeed(ImportSourceAdapters, adapterRegistry)

export const createImportsWorker = ({
  consumer,
  publisher,
  eventsPublisher,
  postgresClient,
  clickhouseClient,
  redisClient,
}: ImportsDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()
  const chClient = clickhouseClient ?? getClickhouseClient()
  const rdClient = redisClient ?? getRedisClient()

  const publishNextPage = createFetchPagePublisher(publisher)
  const processPage = processImportPageUseCase({ publishNextPage, eventsPublisher })
  const startImport = startImportUseCase({ publish: publishNextPage })
  const recordFinalFailure = (
    payload: { organizationId: string; projectId: string; importJobId: string },
    error: Error,
  ) =>
    recordImportFinalFailureUseCase({
      organizationId: payload.organizationId,
      projectId: payload.projectId,
      importJobId: payload.importJobId,
      error,
      now: new Date(),
    }).pipe(
      withPostgres(ImportJobRepositoryLive, pgClient, OrganizationId(payload.organizationId)),
      Effect.tap((result) =>
        Effect.sync(() =>
          logger.warn(`imports task exhausted retries importJobId=${payload.importJobId} recorded=${result.recorded}`),
        ),
      ),
      Effect.tapError((failure) =>
        Effect.sync(() =>
          logger.error(`imports failure accounting errored importJobId=${payload.importJobId}`, failure),
        ),
      ),
      withTracing,
      Effect.asVoid,
    )

  consumer.subscribe(
    "imports",
    {
      start: (payload) =>
        startImport({ importJobId: ImportJobId(payload.importJobId) }).pipe(
          withPostgres(postgresLayers, pgClient, OrganizationId(payload.organizationId)),
          withTracing,
          Effect.asVoid,
        ),

      fetchPage: (payload) =>
        Effect.gen(function* () {
          const organizationId = OrganizationId(payload.organizationId)
          // No fallback: imported traces are billed, so a page must not run without knowing
          // the plan it bills against. A resolution failure retries with the page.
          const plan = yield* resolveEffectivePlanCached(organizationId)
          const organizations = yield* OrganizationRepository
          const organization = yield* organizations.findById(organizationId)

          // The redaction cascade is resolved here for the same reason the ingest route
          // resolves it at its boundary: the org half comes from a cached platform reader.
          // Per page rather than per job, so enabling redaction lands on the next page.
          const organizationRedaction = yield* resolveOrganizationRedactionCached(organizationId)
          const projects = yield* ProjectRepository
          const project = yield* projects.findById(payload.projectId)
          const resolvedRedaction = resolveRedactionPolicy({
            organization: organizationRedaction ? { redaction: organizationRedaction } : {},
            project: project.settings,
          })

          const result = yield* processPage({
            organizationId: payload.organizationId,
            projectId: payload.projectId,
            importJobId: payload.importJobId,
            plan,
            isSandbox: isSandbox(organization),
            redactionPolicy: resolvedRedaction.mode === "off" ? null : resolvedRedaction,
            ...(pseudonymSecret ? { pseudonymSecret } : {}),
            ...(payload.rateLimitWaits !== undefined ? { rateLimitWaits: payload.rateLimitWaits } : {}),
          })

          // One line per import, not per page: a 1000-page import would otherwise
          // bury everything else in the worker log.
          if (result.done) {
            yield* Effect.sync(() =>
              logger.info(`imports.fetchPage settled importJobId=${payload.importJobId} reason=${result.reason}`),
            )
          }
        }).pipe(
          Effect.tapError((error) =>
            Effect.sync(() => logger.error(`imports.fetchPage failed importJobId=${payload.importJobId}`, error)),
          ),
          withPostgres(
            Layer.mergeAll(postgresLayers, billingPlanLayers),
            pgClient,
            OrganizationId(payload.organizationId),
          ),
          withClickHouse(SpanRepositoryLive, chClient, OrganizationId(payload.organizationId)),
          Effect.provide(adaptersLayer),
          Effect.provide(RedisCacheStoreLive(rdClient)),
          withTracing,
          Effect.asVoid,
        ),

      "delete-by-project": (payload) =>
        deleteProjectImportsUseCase({
          organizationId: OrganizationId(payload.organizationId),
          projectId: ProjectId(payload.projectId),
        }).pipe(
          Effect.tap((result) =>
            Effect.sync(() =>
              logger.info(`imports.delete-by-project projectId=${payload.projectId} deleted=${result.deleted}`),
            ),
          ),
          Effect.tapError((error) =>
            Effect.sync(() => logger.error(`imports.delete-by-project failed projectId=${payload.projectId}`, error)),
          ),
          withPostgres(postgresLayers, pgClient, OrganizationId(payload.organizationId)),
          withTracing,
          Effect.asVoid,
        ),
    },
    {
      concurrency: IMPORT_WORKER_CONCURRENCY,
      onFinalFailure: {
        start: recordFinalFailure,
        fetchPage: recordFinalFailure,
      },
    },
  )
}
