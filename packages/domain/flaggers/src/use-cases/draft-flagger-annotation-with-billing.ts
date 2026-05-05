import {
  authorizeBillableAction,
  buildBillingIdempotencyKey,
  NoCreditsRemainingError,
  resolveEffectivePlan,
} from "@domain/billing"
import { QueuePublisher } from "@domain/queue"
import { OrganizationId } from "@domain/shared"
import { Effect, Exit } from "effect"
import { type DraftFlaggerAnnotationOutput, draftFlaggerAnnotationUseCase } from "./draft-flagger-annotation.ts"

export interface DraftFlaggerAnnotationWithBillingInput {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly flaggerSlug: string
}

export const draftFlaggerAnnotationWithBillingUseCase = Effect.fn("flaggers.draftFlaggerAnnotationWithBilling")(
  function* (input: DraftFlaggerAnnotationWithBillingInput) {
    const organizationId = OrganizationId(input.organizationId)
    const idempotencyKey = buildBillingIdempotencyKey("flagger-scan", [
      input.organizationId,
      input.flaggerSlug,
      input.traceId,
    ])

    const resolvedPlan = yield* resolveEffectivePlan(organizationId)
    const billing = yield* authorizeBillableAction({
      organizationId,
      action: "flagger-scan",
      skipIfBlocked: true,
      resolvedPlan,
    })

    if (!billing.allowed) {
      return yield* Effect.fail(
        new NoCreditsRemainingError({
          organizationId,
          planSlug: billing.context.planSlug,
          action: "flagger-scan",
        }),
      )
    }

    const queuePublisher = yield* QueuePublisher
    const publishExit = yield* Effect.exit(
      queuePublisher.publish(
        "billing",
        "recordBillableAction",
        {
          organizationId: input.organizationId,
          projectId: input.projectId,
          action: "flagger-scan",
          idempotencyKey,
          context: {
            planSlug: billing.context.planSlug,
            planSource: billing.context.planSource,
            periodStart: billing.context.periodStart.toISOString(),
            periodEnd: billing.context.periodEnd.toISOString(),
            includedCredits: billing.context.includedCredits,
            overageAllowed: billing.context.overageAllowed,
          },
        },
        {
          attempts: 10,
          backoff: { type: "exponential", delayMs: 1_000 },
        },
      ),
    )

    if (Exit.isFailure(publishExit)) {
      yield* Effect.annotateCurrentSpan({
        "billing.alert": "flagger_scan_publish_failed",
        "billing.idempotency_key": idempotencyKey,
      })
    }

    return (yield* draftFlaggerAnnotationUseCase(input)) as DraftFlaggerAnnotationOutput
  },
)
