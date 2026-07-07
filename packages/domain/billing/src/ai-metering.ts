import type { OutboxEventWriter } from "@domain/events"
import type { OrganizationId, ProjectId, SqlClient, TraceId } from "@domain/shared"
import { Context, Effect, Ref } from "effect"
import { buildBillingIdempotencyKey, type ChargeableAction } from "./constants.ts"
import { AIMeteringRecordError } from "./errors.ts"
import type { BillingUsageEventRepository } from "./ports/billing-usage-event-repository.ts"
import type { BillingUsagePeriodRepository } from "./ports/billing-usage-period-repository.ts"
import type { AuthorizedBillableActionContext } from "./use-cases/authorize-billable-action.ts"
import { recordBillableActionUseCase } from "./use-cases/record-billable-action.ts"

export type MeteredAIAction = Extract<ChargeableAction, "llm-call" | "semantic-query">

export interface RecordMeteredAIActionInput {
  readonly action: MeteredAIAction
  readonly metadata?: Record<string, unknown> | undefined
}

/**
 * Ambient billing scope for AI primitives. When present in context, the AI layer
 * charges one `llm-call` per generation and one `semantic-query` per query-time
 * embedding produced under the scope; without it, AI calls run unbilled
 * (platform-internal work such as demo seeding or backoffice tooling).
 */
export interface AIMeteringScopeShape {
  readonly organizationId: OrganizationId
  readonly record: (input: RecordMeteredAIActionInput) => Effect.Effect<void, AIMeteringRecordError>
}

export class AIMeteringScope extends Context.Service<AIMeteringScope, AIMeteringScopeShape>()(
  "@domain/billing/AIMeteringScope",
) {}

export interface MakeAIMeteringScopeInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  /**
   * Identity of the logical operation, e.g. ["flagger", slug, traceId]. Keys are
   * `{action}:{organizationId}:{...keyParts}:{sequence}` with the sequence assigned
   * in call order, so retries of an operation whose calls replay deterministically
   * re-produce the same keys and dedupe instead of double-charging. Parallel AI
   * calls under one scope would break that guarantee — keep scoped calls sequential.
   */
  readonly keyParts: readonly string[]
  readonly context: AuthorizedBillableActionContext
  readonly traceId?: TraceId | undefined
}

type RecordDependencies = BillingUsageEventRepository | BillingUsagePeriodRepository | OutboxEventWriter | SqlClient

export const makeAIMeteringScope = Effect.fn("billing.makeAIMeteringScope")(function* (
  input: MakeAIMeteringScopeInput,
) {
  const runtimeContext = yield* Effect.context<RecordDependencies>()
  const sequence = yield* Ref.make(0)

  const record = (recordInput: RecordMeteredAIActionInput): Effect.Effect<void, AIMeteringRecordError> =>
    Effect.gen(function* () {
      const seq = yield* Ref.getAndUpdate(sequence, (current) => current + 1)
      const idempotencyKey = buildBillingIdempotencyKey(recordInput.action, [
        input.organizationId,
        ...input.keyParts,
        String(seq),
      ])

      yield* recordBillableActionUseCase({
        organizationId: input.organizationId,
        projectId: input.projectId,
        action: recordInput.action,
        idempotencyKey,
        context: input.context,
        traceId: input.traceId,
        metadata: recordInput.metadata,
      })
    }).pipe(
      Effect.provide(runtimeContext),
      Effect.asVoid,
      Effect.mapError(
        (cause) =>
          new AIMeteringRecordError({
            organizationId: input.organizationId,
            action: recordInput.action,
            cause,
          }),
      ),
    )

  return {
    organizationId: input.organizationId,
    record,
  } satisfies AIMeteringScopeShape
})

export const provideAIMeteringScope: (
  scope: AIMeteringScopeShape,
) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, Exclude<R, AIMeteringScope>> = (scope) =>
  Effect.provideService(AIMeteringScope, scope)
