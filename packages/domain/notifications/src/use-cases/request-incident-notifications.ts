import { AlertIncidentRepository } from "@domain/alerts"
import { IssueRepository } from "@domain/issues"
import type { MembershipRepository } from "@domain/organizations"
import { ProjectRepository } from "@domain/projects"
import {
  AlertIncidentId,
  generateId,
  IssueId,
  isAlertNotificationEnabled,
  type NotFoundError,
  NotificationId,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  SettingsReader,
  type SqlClient,
  type UserId,
} from "@domain/shared"
import { Effect } from "effect"
import type { IncidentClosedPayload, IncidentOpenedPayload } from "../entities/notification.ts"
import { buildIdempotencyKey } from "../helpers/idempotency-key.ts"
import { resolveRecipients } from "../helpers/resolve-recipients.ts"

export type IncidentNotificationKind = "incident.opened" | "incident.closed"

export interface RequestIncidentNotificationsInput {
  readonly alertIncidentId: string
  readonly kind: IncidentNotificationKind
}

export interface IncidentNotificationRequest {
  readonly organizationId: OrganizationId
  readonly userId: UserId
  readonly kind: IncidentNotificationKind
  readonly idempotencyKey: string
  readonly payload: IncidentOpenedPayload | IncidentClosedPayload
  /** Pre-generated row id so producer + consumer can share it for retries. */
  readonly notificationId: NotificationId
  /** Project anchor for cascade-delete on `ProjectDeleted`. */
  readonly projectId: ProjectId
}

export type RequestIncidentNotificationsResult =
  | { readonly status: "skipped"; readonly reason: "kind-disabled" | "no-recipients" }
  | { readonly status: "ok"; readonly requests: readonly IncidentNotificationRequest[] }

export type RequestIncidentNotificationsError = RepositoryError | NotFoundError

/**
 * Producer step for incident notifications. Looks up the incident, applies
 * the project-level alert-kind gate, snapshots issue + project identity
 * into the payload, resolves recipients, and returns one
 * `CreateNotification`-shaped request per recipient. The caller (worker)
 * publishes the requests to the queue.
 *
 * No DB writes happen here — this is pure orchestration. Idempotency is
 * delegated to the consumer via the unique `idempotency_key`.
 */
export const requestIncidentNotificationsUseCase = (input: RequestIncidentNotificationsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("alertIncidentId", input.alertIncidentId)
    yield* Effect.annotateCurrentSpan("kind", input.kind)

    const incidentRepo = yield* AlertIncidentRepository
    const incident = yield* incidentRepo.findById(AlertIncidentId(input.alertIncidentId))

    const reader = yield* SettingsReader
    const projectSettings = yield* reader.getProjectSettings(incident.projectId)
    if (!isAlertNotificationEnabled(projectSettings, incident.kind)) {
      yield* Effect.annotateCurrentSpan("skipped", "alert-notifications-disabled")
      return { status: "skipped", reason: "kind-disabled" } as const
    }

    // Snapshot issue + project identity so the renderer can paint instantly
    // without a live lookup. Failures here shouldn't block delivery —
    // fall back to undefined fields and let the renderer handle missing
    // snapshots.
    const issueRepo = yield* IssueRepository
    const projectRepo = yield* ProjectRepository
    const issue = yield* issueRepo
      .findById(IssueId(incident.sourceId))
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    const project = yield* projectRepo
      .findById(incident.projectId)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

    const recipients = yield* resolveRecipients({
      organizationId: incident.organizationId,
      projectId: incident.projectId,
      kind: incident.kind,
    })

    if (recipients.length === 0) {
      return { status: "skipped", reason: "no-recipients" } as const
    }

    const payload: IncidentOpenedPayload = {
      incidentKind: incident.kind,
      alertIncidentId: incident.id,
      ...(issue ? { issueId: issue.id, issueName: issue.name } : {}),
      ...(project ? { projectId: project.id, projectSlug: project.slug } : {}),
    }
    const idempotencyKey = buildIdempotencyKey({ kind: input.kind, payload })

    const requests: IncidentNotificationRequest[] = recipients.map((userId) => ({
      organizationId: incident.organizationId,
      userId,
      kind: input.kind,
      idempotencyKey,
      payload,
      notificationId: NotificationId(generateId()),
      projectId: incident.projectId,
    }))

    return { status: "ok", requests } as const
  }).pipe(Effect.withSpan("notifications.requestIncidentNotifications")) as Effect.Effect<
    RequestIncidentNotificationsResult,
    RequestIncidentNotificationsError,
    SqlClient | AlertIncidentRepository | IssueRepository | MembershipRepository | ProjectRepository | SettingsReader
  >
