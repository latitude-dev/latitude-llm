import { generateId } from "@domain/shared"
import type {
  CustomMessagePayload,
  IncidentClosedPayload,
  IncidentOpenedPayload,
  WrappedReportPayload,
} from "../entities/notification.ts"

/**
 * Compose the idempotency key used by `(organization_id, user_id,
 * idempotency_key)` to absorb outbox redelivery. The shape is
 * `${kind}:${naturalEntityId}` for kinds with a natural source entity,
 * and `${kind}:${generatedId}` for kinds that should never dedupe
 * (custom messages — every send is a distinct event).
 */
export type BuildIdempotencyKeyInput =
  | { readonly kind: "incident.opened"; readonly payload: IncidentOpenedPayload }
  | { readonly kind: "incident.closed"; readonly payload: IncidentClosedPayload }
  | { readonly kind: "wrapped.report"; readonly payload: WrappedReportPayload }
  | { readonly kind: "custom.message"; readonly payload: CustomMessagePayload }

export const buildIdempotencyKey = (input: BuildIdempotencyKeyInput): string => {
  switch (input.kind) {
    case "incident.opened":
    case "incident.closed":
      return `${input.kind}:${input.payload.alertIncidentId}`
    case "wrapped.report":
      return `${input.kind}:${input.payload.wrappedReportId}`
    case "custom.message":
      return `${input.kind}:${generateId()}`
  }
}
