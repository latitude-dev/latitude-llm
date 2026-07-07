import {
  authorizeBillableAction,
  buildBillingIdempotencyKey,
  makeAIMeteringScope,
  NoCreditsRemainingError,
  provideAIMeteringScope,
} from "@domain/billing"
import { OrganizationId, ProjectId } from "@domain/shared"
import { Context as ActivityContext } from "@temporalio/activity"
import { Effect } from "effect"

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
 * `NoCreditsRemainingError` when the organization is out of credits or over its cap.
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
          new NoCreditsRemainingError({
            organizationId,
            planSlug: authorization.context.planSlug,
            action: "llm-call",
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
