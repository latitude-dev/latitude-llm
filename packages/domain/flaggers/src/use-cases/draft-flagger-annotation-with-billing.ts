import {
  authorizeBillableAction,
  buildBillingIdempotencyKey,
  NoCreditsRemainingError,
  recordBillableActionUseCase,
} from "@domain/billing"
import { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { Effect } from "effect"
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

    const billing = yield* authorizeBillableAction({
      organizationId,
      action: "flagger-scan",
      skipIfBlocked: true,
      idempotencyKey,
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

    const output = (yield* draftFlaggerAnnotationUseCase(input)) as DraftFlaggerAnnotationOutput

    yield* recordBillableActionUseCase({
      organizationId,
      projectId: ProjectId(input.projectId),
      action: "flagger-scan",
      idempotencyKey,
      context: billing.context,
      traceId: TraceId(input.traceId),
      metadata: {
        flaggerSlug: input.flaggerSlug,
        traceId: input.traceId,
      },
    })

    return output
  },
)
