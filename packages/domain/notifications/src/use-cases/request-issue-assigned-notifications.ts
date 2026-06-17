import { SignalRepository } from "@domain/signals"
import {
  generateId,
  type SignalId,
  NotificationId,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  type SqlClient,
  UserId,
} from "@domain/shared"
import { Effect } from "effect"
import type { SignalAssignedPayload } from "../entities/notification.ts"
import { buildIdempotencyKey } from "../helpers/idempotency-key.ts"

export interface RequestSignalAssignedNotificationsInput {
  readonly organizationId: OrganizationId
  readonly signalId: SignalId
  /** New assignee — the single recipient. */
  readonly assigneeId: string
  readonly actorUserId: string
  /** ISO timestamp frozen by the triage transaction; the idempotency anchor. */
  readonly assignedAt: string
}

export interface SignalAssignedNotificationRequest {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly kind: "issue.assigned"
  readonly idempotencyKey: string
  readonly payload: SignalAssignedPayload
  readonly notificationId: NotificationId
  /** Project anchor for cascade-delete on `ProjectDeleted`. */
  readonly projectId: ProjectId
}

export type RequestSignalAssignedNotificationsResult =
  | { readonly status: "skipped"; readonly reason: "self-assignment" | "issue-not-found" }
  | { readonly status: "ok"; readonly requests: readonly SignalAssignedNotificationRequest[] }

export type RequestSignalAssignedNotificationsError = RepositoryError

/**
 * Producer step for `issue.assigned` notifications. Unlike incident kinds
 * this is personal: exactly one recipient (the new assignee), no
 * org-member fan-out, and no project-level gate — a notification addressed
 * directly at a user should not be silenced by a project's broadcast mute.
 * The domain-events router already filters cleared assignments and
 * self-assignments; both are re-checked here so the rule lives in one
 * testable place.
 */
export const requestSignalAssignedNotificationsUseCase = (input: RequestSignalAssignedNotificationsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("signalId", input.signalId)

    if (input.assigneeId === input.actorUserId) {
      yield* Effect.annotateCurrentSpan("skipped", "self-assignment")
      return { status: "skipped", reason: "self-assignment" } as const
    }

    // Re-fetch the authoritative issue row: it anchors the notification to
    // its project (cascade delete) and a deleted issue means there is
    // nothing left to notify about.
    const issues = yield* SignalRepository
    const issue = yield* issues
      .findById(input.signalId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    if (issue === null) {
      yield* Effect.annotateCurrentSpan("skipped", "issue-not-found")
      return { status: "skipped", reason: "issue-not-found" } as const
    }

    const payload: SignalAssignedPayload = {
      signalId: input.signalId,
      actorUserId: input.actorUserId,
      assignedAt: input.assignedAt,
    }
    const idempotencyKey = buildIdempotencyKey({ kind: "issue.assigned", payload })

    const requests: SignalAssignedNotificationRequest[] = [
      {
        organizationId: input.organizationId,
        userId: UserId(input.assigneeId),
        kind: "issue.assigned" as const,
        idempotencyKey,
        payload,
        notificationId: NotificationId(generateId()),
        projectId: issue.projectId as ProjectId,
      },
    ]

    return { status: "ok", requests } as const
  }).pipe(Effect.withSpan("notifications.requestSignalAssignedNotifications")) as Effect.Effect<
    RequestSignalAssignedNotificationsResult,
    RequestSignalAssignedNotificationsError,
    SqlClient | SignalRepository
  >
