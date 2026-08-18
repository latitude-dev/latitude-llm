import { generateId } from "@domain/shared"
import type {
  BillingLimitReachedPayload,
  CustomMessagePayload,
  DestinationQuarantinedPayload,
  IncidentClosedPayload,
  IncidentEventPayload,
  IncidentOpenedPayload,
  SignalAssignedPayload,
  SignalDiscoveredPayload,
  SignalRegressedPayload,
  SignalReprioritizedPayload,
  WrappedReportPayload,
} from "../entities/notification.ts"

/**
 * Compose the idempotency key used by `(organization_id, user_id,
 * idempotency_key)` to absorb outbox redelivery. The shape is
 * `${kind}:${naturalEntityId}` for kinds with a natural source entity,
 * `${kind}:${entityId}:${eventTimestamp}` for kinds whose natural anchor
 * is a recurring event on the same entity (issue assignments — the
 * unique index is permanent, so keying on `signalId:assigneeId` alone
 * would suppress a legitimate later re-assignment forever), and
 * `${kind}:${generatedId}` for kinds that should never dedupe
 * (custom messages — every send is a distinct event).
 */
export type BuildIdempotencyKeyInput =
  | { readonly kind: "incident.event"; readonly payload: IncidentEventPayload }
  | {
      readonly kind: "incident.opened"
      readonly payload: IncidentOpenedPayload
    }
  | {
      readonly kind: "incident.closed"
      readonly payload: IncidentClosedPayload
    }
  | { readonly kind: "wrapped.report"; readonly payload: WrappedReportPayload }
  | { readonly kind: "custom.message"; readonly payload: CustomMessagePayload }
  | { readonly kind: "issue.assigned"; readonly payload: SignalAssignedPayload }
  | { readonly kind: "signal.discovered"; readonly payload: SignalDiscoveredPayload }
  | { readonly kind: "signal.regressed"; readonly payload: SignalRegressedPayload }
  | { readonly kind: "signal.reprioritized"; readonly payload: SignalReprioritizedPayload }
  | {
      readonly kind: "destination.quarantined"
      readonly payload: DestinationQuarantinedPayload
    }
  | {
      readonly kind: "billing.limit-reached"
      readonly payload: BillingLimitReachedPayload
    }

export const buildIdempotencyKey = (input: BuildIdempotencyKeyInput): string => {
  switch (input.kind) {
    case "incident.event":
    case "incident.opened":
    case "incident.closed":
      return `${input.kind}:${input.payload.alertIncidentId}`
    case "wrapped.report":
      return `${input.kind}:${input.payload.wrappedReportId}`
    case "custom.message":
      return `${input.kind}:${generateId()}`
    case "issue.assigned":
      // The recipient (assignee) is already part of the unique index, so the
      // key only needs to discriminate assignment events on the same issue.
      return `${input.kind}:${input.payload.signalId}:${input.payload.assignedAt}`
    case "signal.discovered":
      return `${input.kind}:${input.payload.signalId}`
    case "signal.regressed":
      // Per regression cycle: the reopen claim guarantees one trigger score
      // per cycle, so the score id discriminates repeat regressions.
      return `${input.kind}:${input.payload.signalId}:${input.payload.triggerScoreId}`
    case "signal.reprioritized":
      // Per triage edit: the permanent index would otherwise suppress a later
      // priority change on the same signal forever (mirrors issue.assigned).
      return `${input.kind}:${input.payload.signalId}:${input.payload.reprioritizedAt}`
    case "destination.quarantined":
      // Per-occurrence: a destination recovered then re-quarantined is a new
      // event the permanent index must not suppress, so the flip timestamp
      // joins the id (mirrors issue.assigned).
      return `${input.kind}:${input.payload.destinationId}:${input.payload.quarantinedAt}`
    case "billing.limit-reached":
      // Once per billing period per limit kind. Period bounds alone collide
      // across orgs for multi-org users, and create-notification BullMQ
      // dedupe keys are built from this string (not the PG unique index).
      return `${input.kind}:org:${input.payload.organizationId}:${input.payload.periodStart}:${input.payload.limitKind}`
  }
}
