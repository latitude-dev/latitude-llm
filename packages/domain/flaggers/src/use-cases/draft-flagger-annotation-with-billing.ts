import {
  authorizeBillableAction,
  buildBillingIdempotencyKey,
  makeAIMeteringScope,
  NoCreditsRemainingError,
  provideAIMeteringScope,
} from "@domain/billing"
import { OrganizationId, ProjectId, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { type DraftFlaggerAnnotationOutput, draftFlaggerAnnotationUseCase } from "./draft-flagger-annotation.ts"

export interface DraftFlaggerAnnotationWithBillingInput {
  readonly organizationId: string
  readonly projectId: string
  readonly traceId: string
  readonly flaggerSlug: string
  readonly feedback?: string | undefined
  readonly messageIndex?: number | undefined
}

export const draftFlaggerAnnotationWithBillingUseCase = Effect.fn("flaggers.draftFlaggerAnnotationWithBilling")(
  function* (input: DraftFlaggerAnnotationWithBillingInput) {
    const organizationId = OrganizationId(input.organizationId)
    const authorizationKey = buildBillingIdempotencyKey("llm-call", [
      input.organizationId,
      "flagger",
      input.flaggerSlug,
      input.traceId,
      "authorize",
    ])

    // Boundary gate: authorize (and reserve) one llm-call before any AI work. The
    // scope below then records what the flow actually produces, so a flow that makes
    // several calls may overshoot a cap by the calls in one flow — same intentional
    // coarseness as the trace ingest gate.
    const billing = yield* authorizeBillableAction({
      organizationId,
      action: "llm-call",
      skipIfBlocked: true,
      idempotencyKey: authorizationKey,
    })

    if (!billing.allowed) {
      return yield* Effect.fail(
        new NoCreditsRemainingError({
          organizationId,
          planSlug: billing.context.planSlug,
          action: "llm-call",
        }),
      )
    }

    const meteringScope = yield* makeAIMeteringScope({
      organizationId,
      projectId: ProjectId(input.projectId),
      keyParts: ["flagger", input.flaggerSlug, input.traceId],
      context: billing.context,
      traceId: TraceId(input.traceId),
    })

    return (yield* draftFlaggerAnnotationUseCase(input).pipe(
      provideAIMeteringScope(meteringScope),
    )) as DraftFlaggerAnnotationOutput
  },
)
