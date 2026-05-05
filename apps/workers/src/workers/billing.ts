import {
  type AuthorizedBillableActionContext,
  BillingOverageReporter,
  BillingUsagePeriodRepository,
  PRO_PLAN_CONFIG,
  recordBillableActionUseCase,
  recordTraceUsageBatchUseCase,
  StripeSubscriptionLookup,
} from "@domain/billing"
import { type QueueConsumer, QueuePublisher, type QueuePublisherShape } from "@domain/queue"
import { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import {
  BillingOverageReporterLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  type PostgresClient,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient } from "../clients.ts"

const logger = createLogger("billing")

interface BillingDeps {
  consumer: QueueConsumer
  postgresClient?: PostgresClient
  publisher?: QueuePublisherShape
}

interface ReportOveragePayload {
  readonly organizationId: string
  readonly periodStart: string
  readonly periodEnd: string
}

interface RecordTraceUsageBatchPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly traceIds: readonly string[]
  readonly planSlug: "free" | "pro" | "enterprise"
  readonly planSource: "override" | "subscription" | "free-fallback"
  readonly periodStart: string
  readonly periodEnd: string
  readonly includedCredits: number
  readonly overageAllowed: boolean
}

interface RecordBillableActionPayload {
  readonly organizationId: string
  readonly projectId: string
  readonly action: "trace" | "flagger-scan" | "live-eval-scan" | "eval-generation"
  readonly idempotencyKey: string
  readonly context: {
    readonly planSlug: "free" | "pro" | "enterprise"
    readonly planSource: "override" | "subscription" | "free-fallback"
    readonly periodStart: string
    readonly periodEnd: string
    readonly includedCredits: number
    readonly overageAllowed: boolean
  }
  readonly traceId?: string
  readonly metadata?: Record<string, unknown>
}

const billingLayers = Layer.mergeAll(
  BillingOverageReporterLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
)

export const createBillingWorker = ({ consumer, postgresClient, publisher }: BillingDeps) => {
  const pgClient = postgresClient ?? getPostgresClient()

  const ensurePublisher = () => {
    if (!publisher) {
      return Effect.fail(new Error("Billing worker requires a queue publisher for billing tasks"))
    }

    return Effect.succeed(publisher)
  }

  consumer.subscribe(
    "billing",
    {
      recordBillableAction: (payload: RecordBillableActionPayload) =>
        Effect.gen(function* () {
          const queuePublisher = yield* ensurePublisher()

          return yield* recordBillableActionUseCase({
            organizationId: OrganizationId(payload.organizationId),
            projectId: ProjectId(payload.projectId),
            action: payload.action,
            idempotencyKey: payload.idempotencyKey,
            context: {
              planSlug: payload.context.planSlug,
              planSource: payload.context.planSource,
              periodStart: new Date(payload.context.periodStart),
              periodEnd: new Date(payload.context.periodEnd),
              includedCredits: payload.context.includedCredits,
              overageAllowed: payload.context.overageAllowed,
            } satisfies AuthorizedBillableActionContext,
            ...(payload.traceId ? { traceId: TraceId(payload.traceId) } : {}),
            ...(payload.metadata ? { metadata: payload.metadata } : {}),
          }).pipe(Effect.provideService(QueuePublisher, queuePublisher))
        }).pipe(
          withPostgres(billingLayers, pgClient, OrganizationId(payload.organizationId)),
          withTracing,
          Effect.tapError((error) =>
            Effect.sync(() =>
              logger.error("Billing record billable action failed", {
                organizationId: payload.organizationId,
                projectId: payload.projectId,
                action: payload.action,
                idempotencyKey: payload.idempotencyKey,
                error,
              }),
            ),
          ),
          Effect.asVoid,
        ),

      recordTraceUsageBatch: (payload: RecordTraceUsageBatchPayload) => {
        const batchEffect = recordTraceUsageBatchUseCase({
          organizationId: OrganizationId(payload.organizationId),
          projectId: ProjectId(payload.projectId),
          traceIds: payload.traceIds.map((traceId) => TraceId(traceId)),
          planSlug: payload.planSlug,
          planSource: payload.planSource,
          periodStart: new Date(payload.periodStart),
          periodEnd: new Date(payload.periodEnd),
          includedCredits: payload.includedCredits,
          overageAllowed: payload.overageAllowed,
        }).pipe(
          withPostgres(billingLayers, pgClient, OrganizationId(payload.organizationId)),
          withTracing,
          Effect.tapError((error) =>
            Effect.sync(() =>
              logger.error("Billing trace usage batch failed", {
                organizationId: payload.organizationId,
                projectId: payload.projectId,
                traceCount: payload.traceIds.length,
                error,
              }),
            ),
          ),
          Effect.asVoid,
        )

        if (!publisher) {
          return Effect.fail(new Error("Billing worker requires a queue publisher for trace usage batches"))
        }

        return batchEffect.pipe(Effect.provideService(QueuePublisher, publisher))
      },
    },
    { concurrency: 50 },
  )

  consumer.subscribe(
    "billing-overage",
    {
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

          const subscriptionLookup = yield* StripeSubscriptionLookup
          const subscription = yield* subscriptionLookup.findActiveByOrganizationId(organizationId)

          if (!subscription?.stripeSubscriptionId || !subscription.stripeCustomerId) {
            logger.info("Billing overage sync skipped", {
              organizationId: payload.organizationId,
              periodStart: payload.periodStart,
              periodEnd: payload.periodEnd,
              reason: "subscription-not-found",
            })
            return
          }

          const reporter = yield* BillingOverageReporter
          const result = yield* reporter.reportOverage({
            organizationId,
            stripeCustomerId: subscription.stripeCustomerId,
            stripeSubscriptionId: subscription.stripeSubscriptionId,
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

          yield* periodRepo.advanceReportedOverageCredits({
            organizationId,
            periodStart,
            periodEnd,
            reportedOverageCredits: period.overageCredits,
          })

          logger.info("Billing overage sync completed", {
            organizationId: payload.organizationId,
            periodStart: payload.periodStart,
            periodEnd: payload.periodEnd,
            reportedOverageCredits: period.overageCredits,
          })
        }).pipe(
          withPostgres(
            Layer.mergeAll(BillingOverageReporterLive, BillingUsagePeriodRepositoryLive, StripeSubscriptionLookupLive),
            pgClient,
            OrganizationId(payload.organizationId),
          ),
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
    },
    { concurrency: 1 },
  )
}
