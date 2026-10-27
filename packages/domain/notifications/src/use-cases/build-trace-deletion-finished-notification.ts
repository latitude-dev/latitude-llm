import { generateId, NotificationId, OrganizationId, ProjectId, UserId } from "@domain/shared"
import type { TraceDeletionFinishedPayload } from "../entities/notification.ts"
import { buildIdempotencyKey } from "../helpers/idempotency-key.ts"

export interface BuildTraceDeletionFinishedNotificationInput {
  readonly organizationId: string
  readonly projectId: string
  readonly traceDeletionRequestId: string
  readonly status: TraceDeletionFinishedPayload["status"]
  readonly requestedBy: { readonly type: "user" | "api_key" | "staff"; readonly id: string }
  readonly matchedTraceCount: number
}

export interface TraceDeletionFinishedNotificationRequest {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly kind: "trace-deletion.finished"
  readonly idempotencyKey: string
  readonly payload: TraceDeletionFinishedPayload
  readonly notificationId: NotificationId
  readonly projectId: ProjectId
}

/**
 * Producer step for `trace-deletion.finished`: one notification for the user who requested the
 * deletion. API-key and staff deletions have no user waiting on them, so they notify nobody.
 */
export const buildTraceDeletionFinishedNotification = (
  input: BuildTraceDeletionFinishedNotificationInput,
): TraceDeletionFinishedNotificationRequest | null => {
  if (input.requestedBy.type !== "user") return null

  const payload: TraceDeletionFinishedPayload = {
    traceDeletionRequestId: input.traceDeletionRequestId,
    status: input.status,
    matchedTraceCount: input.matchedTraceCount,
  }
  return {
    organizationId: OrganizationId(input.organizationId),
    userId: UserId(input.requestedBy.id),
    kind: "trace-deletion.finished",
    idempotencyKey: buildIdempotencyKey({ kind: "trace-deletion.finished", payload }),
    payload,
    notificationId: NotificationId(generateId()),
    projectId: ProjectId(input.projectId),
  }
}
