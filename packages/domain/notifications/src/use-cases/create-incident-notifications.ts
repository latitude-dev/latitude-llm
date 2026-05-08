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
  type RepositoryError,
  SettingsReader,
  type SqlClient,
} from "@domain/shared"
import { Effect } from "effect"
import type { IncidentNotificationEvent, IncidentNotificationPayload, Notification } from "../entities/notification.ts"
import { resolveRecipients } from "../helpers/resolve-recipients.ts"
import { NotificationRepository } from "../ports/notification-repository.ts"

export interface CreateIncidentNotificationsInput {
  readonly alertIncidentId: string
  readonly event: IncidentNotificationEvent
}

export type CreateIncidentNotificationsError = RepositoryError | NotFoundError

/**
 * Fan out an alert_incident lifecycle moment (opened or closed) to one
 * notification row per org member. Idempotent: re-runs hit the partial
 * unique index on (org, user, source_id, payload->>event) and silently
 * dedupe.
 *
 * Skipped when project settings have `alertNotifications[kind] === false`.
 * Default behaviour with no setting set is enabled.
 */
export const createIncidentNotificationsUseCase = (input: CreateIncidentNotificationsInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("alertIncidentId", input.alertIncidentId)
    yield* Effect.annotateCurrentSpan("event", input.event)

    const incidentRepo = yield* AlertIncidentRepository
    const incident = yield* incidentRepo.findById(AlertIncidentId(input.alertIncidentId))

    // Alert-notification settings are project-shaped (no org cascade), so
    // we read project settings directly instead of going through resolveSettings.
    const reader = yield* SettingsReader
    const projectSettings = yield* reader.getProjectSettings(incident.projectId)
    if (!isAlertNotificationEnabled(projectSettings, incident.kind)) {
      yield* Effect.annotateCurrentSpan("skipped", "alert-notifications-disabled")
      return { inserted: 0, skipped: true as const }
    }

    // Snapshot the issue + project identity into the notification payload so
    // the renderer can paint instantly without a live lookup. Lookups failing
    // shouldn't block notification delivery — fall back to undefined fields
    // and let the renderer handle the missing-snapshot case.
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
      return { inserted: 0, skipped: false as const }
    }

    const payload: IncidentNotificationPayload = {
      event: input.event,
      incidentKind: incident.kind,
      ...(issue ? { issueId: issue.id, issueName: issue.name } : {}),
      ...(project ? { projectId: project.id, projectSlug: project.slug } : {}),
    }

    const now = new Date()
    const rows: Notification[] = recipients.map((userId) => ({
      id: NotificationId(generateId()),
      organizationId: incident.organizationId,
      userId,
      type: "incident",
      sourceId: incident.id,
      payload,
      createdAt: now,
      seenAt: null,
    }))

    const notificationRepo = yield* NotificationRepository
    yield* notificationRepo.bulkInsert(rows)

    return { inserted: rows.length, skipped: false as const }
  }).pipe(Effect.withSpan("notifications.createIncidentNotifications")) as Effect.Effect<
    { readonly inserted: number; readonly skipped: boolean },
    CreateIncidentNotificationsError,
    | SqlClient
    | AlertIncidentRepository
    | IssueRepository
    | MembershipRepository
    | NotificationRepository
    | ProjectRepository
    | SettingsReader
  >
