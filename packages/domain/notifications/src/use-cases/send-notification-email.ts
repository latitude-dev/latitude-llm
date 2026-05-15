import { ProjectRepository } from "@domain/projects"
import type { NotFoundError, NotificationId, RepositoryError, SqlClient } from "@domain/shared"
import { UserRepository } from "@domain/users"
import { Effect } from "effect"
import type { Notification, NotificationKind } from "../entities/notification.ts"
import { NotificationRepository } from "../ports/notification-repository.ts"

export interface RenderedEmailBoundary {
  readonly subject: string
  readonly html: string
  readonly text: string
}

export interface NotificationEmailRecipient {
  readonly userId: string
  readonly name: string | null
  readonly email: string
}

/**
 * Minimal project snapshot threaded to renderers when the notification is
 * project-anchored. Looked up server-side at email-send time so
 * notification payloads don't have to carry stale `projectName` /
 * `projectSlug` fields.
 */
export interface NotificationEmailProject {
  readonly id: string
  readonly name: string
  readonly slug: string
}

/**
 * Boundary contract that channel adapters (today: `@domain/email`'s
 * notification template registry) implement. Keeps `@domain/notifications`
 * unaware of React Email internals — the use case just calls back.
 */
export type NotificationEmailRenderer = (input: {
  readonly kind: NotificationKind
  readonly payload: Record<string, unknown>
  readonly recipient: NotificationEmailRecipient
  /** `null` when the notification has no `projectId`, or when the project lookup missed. */
  readonly project: NotificationEmailProject | null
}) => Effect.Effect<RenderedEmailBoundary, RenderNotificationEmailError>

/**
 * Same minimal contract as `@domain/email`'s `sendEmail`. We don't import
 * its type to avoid a domain-to-domain dependency edge; the worker wires
 * the real implementation.
 */
export type NotificationEmailSender = (message: {
  readonly to: string
  readonly subject: string
  readonly html: string
  readonly text?: string
}) => Effect.Effect<void, SendNotificationEmailTransportError>

export interface RenderNotificationEmailError {
  readonly _tag: "RenderNotificationEmailError"
  readonly message: string
  readonly cause?: unknown
}

export interface SendNotificationEmailTransportError {
  readonly _tag: "SendNotificationEmailTransportError"
  readonly message: string
  readonly cause?: unknown
}

export interface SendNotificationEmailInput {
  readonly notificationId: NotificationId
}

export type SendNotificationEmailError =
  | RepositoryError
  | NotFoundError
  | RenderNotificationEmailError
  | SendNotificationEmailTransportError

/**
 * Emailer step. Atomically claims the right to send via `markEmailed`
 * (which only sets `emailed_at` when it's still NULL), then renders and
 * sends. Order is deliberate: stamp first, then send.
 *
 * Trade-off (matches the design doc): if the SMTP call fails after we
 * stamped, the user never gets the email for this notification. We
 * prefer that to the alternative (send-then-stamp), which can produce
 * duplicate emails on at-least-once redelivery.
 *
 * Project lookup: if `notification.projectId` is set, we resolve the
 * project once here and pass a snapshot to the renderer. A missing
 * project (deleted between request and send) is non-fatal — the
 * renderer sees `project: null` and chooses fallback wording.
 */
export const sendNotificationEmailUseCase =
  ({
    renderEmail,
    sendEmail,
  }: {
    readonly renderEmail: NotificationEmailRenderer
    readonly sendEmail: NotificationEmailSender
  }) =>
  (input: SendNotificationEmailInput) =>
    Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan("notificationId", input.notificationId)

      const notifications = yield* NotificationRepository
      const users = yield* UserRepository
      const projects = yield* ProjectRepository

      const notification: Notification = yield* notifications.findById(input.notificationId)

      // Claim. If the row is already stamped, somebody else already (or
      // is about to) send the email and we exit.
      const claimed = yield* notifications.markEmailed(notification.id)
      if (!claimed) {
        yield* Effect.annotateCurrentSpan("skipped", "already-emailed")
        return { sent: false as const }
      }

      const user = yield* users.findById(notification.userId)

      // Optional project snapshot. Catch NotFoundError so a project
      // deletion between request and send doesn't break the email.
      const project: NotificationEmailProject | null = notification.projectId
        ? yield* projects.findById(notification.projectId).pipe(
            Effect.map((p): NotificationEmailProject => ({ id: p.id, name: p.name, slug: p.slug })),
            Effect.catchTag("NotFoundError", () => Effect.succeed<NotificationEmailProject | null>(null)),
          )
        : null

      const rendered = yield* renderEmail({
        kind: notification.kind,
        payload: notification.payload,
        recipient: { userId: user.id, name: user.name, email: user.email },
        project,
      })

      yield* sendEmail({
        to: user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      })

      return { sent: true as const }
    }).pipe(Effect.withSpan("notifications.sendNotificationEmail")) as Effect.Effect<
      { readonly sent: boolean },
      SendNotificationEmailError,
      SqlClient | NotificationRepository | ProjectRepository | UserRepository
    >
