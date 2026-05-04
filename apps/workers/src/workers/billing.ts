import { BillingOverageReporter, BillingUsagePeriodRepository, PRO_PLAN_CONFIG } from "@domain/billing"
import type { QueueConsumer } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import {
  BillingOverageReporterLive,
  BillingUsagePeriodRepositoryLive,
  type PostgresClient,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"
import { getPostgresClient } from "../clients.ts"

const logger = createLogger("billing")

interface BillingDeps {
  consumer: QueueConsumer
  postgresClient?: PostgresClient
}

interface ReportOveragePayload {
  readonly organizationId: string
  readonly periodStart: string
  readonly periodEnd: string
}

export const createBillingWorker = ({ consumer, postgresClient }: BillingDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()

  consumer.subscribe("billing", {
    reportOverage: (payload: ReportOveragePayload) =>
      Effect.gen(function* () {
        const organizationId = OrganizationId(payload.organizationId)
        const periodStart = new Date(payload.periodStart)
        const periodEnd = new Date(payload.periodEnd)
        const periodRepo = yield* BillingUsagePeriodRepository
        const period = yield* periodRepo.findByPeriod({
          organizationId,
          periodStart,
          periodEnd,
        })

        if (
          !period ||
          period.planSlug !== PRO_PLAN_CONFIG.slug ||
          period.overageCredits <= period.reportedOverageCredits
        ) {
          return
        }

        const reporter = yield* BillingOverageReporter
        const result = yield* reporter.reportOverage({
          organizationId,
          periodStart,
          periodEnd,
          overageCreditsToReport: period.overageCredits - period.reportedOverageCredits,
        })

        if (result.status !== "reported") {
          logger.info("Billing overage sync skipped", {
            organizationId: payload.organizationId,
            periodStart: payload.periodStart,
            periodEnd: payload.periodEnd,
            reason: result.reason,
          })
          return
        }

        yield* periodRepo.upsert({
          ...period,
          reportedOverageCredits: period.overageCredits,
          updatedAt: new Date(),
        })

        logger.info("Billing overage sync completed", {
          organizationId: payload.organizationId,
          periodStart: payload.periodStart,
          periodEnd: payload.periodEnd,
          reportedOverageCredits: period.overageCredits,
        })
      }).pipe(
        withPostgres(BillingUsagePeriodRepositoryLive, pgClient, OrganizationId(payload.organizationId)),
        Effect.provide(BillingOverageReporterLive),
        withTracing,
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error("Billing overage sync failed", {
              organizationId: payload.organizationId,
              periodStart: payload.periodStart,
              periodEnd: payload.periodEnd,
              error,
            }),
          ),
        ),
      ),
  })
}
