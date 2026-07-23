import {
  authorizeBillableAction,
  buildBillingIdempotencyKey,
  makeAIMeteringScope,
  provideAIMeteringScope,
} from "@domain/billing"
import { BadRequestError, OrganizationId, ProjectId } from "@domain/shared"
import {
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  OutboxEventWriterLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
} from "@platform/db-postgres"
import { Context as ActivityContext } from "@temporalio/activity"
import { Effect, Layer } from "effect"

/** Postgres repository set required by `withActivityAIMetering`; merge into the activity's `withPostgres` layer. */
export const billingMeteringRepositoriesLive = Layer.mergeAll(
  BillingOverrideRepositoryLive,
  BillingUsageEventRepositoryLive,
  BillingUsagePeriodRepositoryLive,
  OutboxEventWriterLive,
  SettingsReaderLive,
  StripeSubscriptionLookupLive,
)

/**
 * Idempotency identity for per-call AI metering inside a Temporal activity: unique per
 * scheduled activity within a workflow run, stable across retries of that activity. The
 * fallback covers direct invocation outside a Temporal context (tests) where retry
 * semantics don't exist.
 */
export const activityMeteringKeyParts = (label: string): readonly string[] => {
  try {
    const info = ActivityContext.current().info
    const runId = info.workflowExecution?.runId
    if (runId === undefined) return [label, crypto.randomUUID()]
    return [label, runId, info.activityId]
  } catch {
    return [label, crypto.randomUUID()]
  }
}

/**
 * Gates the wrapped effect on one authorized `llm-call`, then meters every LLM call and
 * query-time embedding it produces through an `AIMeteringScope`. Fails with
 * `BadRequestError` when the organization is out of credits or over its cap — the
 * workflow retry policy marks that error non-retryable, so blocked activities fail
 * fast instead of burning Temporal retries against a billing state that won't change.
 */
export const withActivityAIMetering =
  (input: { readonly organizationId: string; readonly projectId: string; readonly label: string }) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const organizationId = OrganizationId(input.organizationId)
      const keyParts = activityMeteringKeyParts(input.label)
      const authorization = yield* authorizeBillableAction({
        organizationId,
        action: "llm-call",
        skipIfBlocked: true,
        idempotencyKey: buildBillingIdempotencyKey("llm-call", [input.organizationId, ...keyParts, "authorize"]),
      })

      if (!authorization.allowed) {
        return yield* Effect.fail(
          new BadRequestError({
            message: `Organization ${input.organizationId} has no credits remaining for AI work (plan ${authorization.context.planSlug})`,
          }),
        )
      }

      const meteringScope = yield* makeAIMeteringScope({
        organizationId,
        projectId: ProjectId(input.projectId),
        keyParts,
        context: authorization.context,
      })

      return yield* effect.pipe(provideAIMeteringScope(meteringScope))
    })
