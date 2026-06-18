import type { MembershipRepository } from "@domain/organizations"
import {
  generateId,
  isDestinationNotificationEnabled,
  NotificationId,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  SettingsReader,
  type SqlClient,
  type UserId,
} from "@domain/shared"
import { Effect } from "effect"
import type { DestinationQuarantinedPayload } from "../entities/notification.ts"
import { buildIdempotencyKey } from "../helpers/idempotency-key.ts"
import { resolveRecipients } from "../helpers/resolve-recipients.ts"

export interface RequestDestinationQuarantinedNotificationsInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly destinationId: string
  readonly destinationName: string
  readonly destinationKind: string
  /** ISO timestamp of the quarantine flip; the per-occurrence idempotency anchor. */
  readonly quarantinedAt: string
  /** Sanitized `last_failure_message` (status + taxonomy, never an upstream body). */
  readonly failureMessage: string | null
}

export interface DestinationQuarantinedNotificationRequest {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly kind: "destination.quarantined"
  readonly idempotencyKey: string
  readonly payload: DestinationQuarantinedPayload
  readonly notificationId: NotificationId
  /** Project anchor for cascade-delete on `ProjectDeleted`. */
  readonly projectId: ProjectId
}

export type RequestDestinationQuarantinedNotificationsResult =
  | { readonly status: "skipped"; readonly reason: "project-gate-off" | "no-recipients" }
  | { readonly status: "ok"; readonly requests: readonly DestinationQuarantinedNotificationRequest[] }

export type RequestDestinationQuarantinedNotificationsError = RepositoryError

/**
 * Producer step for `destination.quarantined` notifications. Honors the
 * project-level gate (`projects.settings.notifications.destinations.quarantine`,
 * default on) before fanning out to every org member. Returns one request per
 * recipient; the caller publishes them to the queue. The destination name +
 * kind are snapshotted onto the payload (no live destination resolver exists
 * in the bell); the project anchor drives the `ProjectDeleted` cascade.
 */
export const requestDestinationQuarantinedNotificationsUseCase = (
  input: RequestDestinationQuarantinedNotificationsInput,
) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("organizationId", input.organizationId)
    yield* Effect.annotateCurrentSpan("destinationId", input.destinationId)

    const reader = yield* SettingsReader
    const projectSettings = yield* reader.getProjectSettings(input.projectId)
    if (!isDestinationNotificationEnabled(projectSettings)) {
      yield* Effect.annotateCurrentSpan("skipped", "project-gate-off")
      return { status: "skipped", reason: "project-gate-off" } as const
    }

    const recipients = yield* resolveRecipients({
      organizationId: input.organizationId,
      projectId: input.projectId,
      kind: undefined,
    })
    if (recipients.length === 0) {
      return { status: "skipped", reason: "no-recipients" } as const
    }

    const payload: DestinationQuarantinedPayload = {
      destinationId: input.destinationId,
      destinationName: input.destinationName,
      destinationKind: input.destinationKind,
      quarantinedAt: input.quarantinedAt,
      failureMessage: input.failureMessage,
    }
    const idempotencyKey = buildIdempotencyKey({ kind: "destination.quarantined", payload })

    const requests: DestinationQuarantinedNotificationRequest[] = recipients.map((userId) => ({
      organizationId: input.organizationId,
      userId,
      kind: "destination.quarantined" as const,
      idempotencyKey,
      payload,
      notificationId: NotificationId(generateId()),
      projectId: input.projectId,
    }))

    return { status: "ok", requests } as const
  }).pipe(Effect.withSpan("notifications.requestDestinationQuarantinedNotifications")) as Effect.Effect<
    RequestDestinationQuarantinedNotificationsResult,
    RequestDestinationQuarantinedNotificationsError,
    SqlClient | MembershipRepository | SettingsReader
  >
