import { NOTIFICATION_EMAIL_RENDERERS, type NotificationEmailRenderContext, sendEmail } from "@domain/email"
import {
  type NotificationEmailRenderer,
  type NotificationEmailSender,
  payloadSchemaFor,
  sendNotificationEmailUseCase,
} from "@domain/notifications"
import type { QueueConsumer } from "@domain/queue"
import { NotificationId, OrganizationId } from "@domain/shared"
import {
  NotificationRepositoryLive,
  ProjectRepositoryLive,
  UserRepositoryLive,
  WrappedReportRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createEmailTransportSender } from "@platform/email-transport"
import { parseEnv } from "@platform/env"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient } from "../clients.ts"

const logger = createLogger("notification-emailer")

interface NotificationEmailerDeps {
  consumer: QueueConsumer
}

/**
 * Layers the email-send use case itself needs (Notification / User /
 * Project repos for the row + recipient + project lookups).
 */
const repoLayer = Layer.mergeAll(NotificationRepositoryLive, ProjectRepositoryLive, UserRepositoryLive)

/**
 * Layers the per-kind renderers need on top of `repoLayer`. Each kind's
 * renderer declares its services on its Effect's `R` channel; the
 * adapter provides this layer locally so those requirements don't leak
 * into the use case's signature. Add to this when a new kind needs a
 * new repo for server-side rendering.
 */
const rendererLayer = WrappedReportRepositoryLive

const resolveWebAppUrl = (): string => {
  const webUrl = Effect.runSync(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000"))
  return webUrl.replace(/\/$/, "")
}

/**
 * Channel worker: consumes `notification-email:send` tasks, looks up the
 * stored notification + recipient, dispatches to the per-kind email
 * renderer Effect via the registry, then sends through the email
 * transport.
 *
 * Idempotency: `sendNotificationEmailUseCase` claims the right to send
 * by stamping `emailed_at` (conditional on `IS NULL`); a redelivered
 * job that finds the row already stamped exits silently.
 */
export const createNotificationEmailerWorker = ({ consumer }: NotificationEmailerDeps) => {
  const emailTransport = createEmailTransportSender()
  const transportSendEmail = sendEmail({ emailSender: emailTransport })
  const webAppUrl = resolveWebAppUrl()

  // Adapter: bridges the use case's renderer-callback boundary to the
  // per-kind renderer Effects in `@domain/email`. The renderers are
  // `Effect`s that pull their own services (e.g. `wrapped.report` yields
  // `WrappedReportRepository.findById`); we provide those services
  // locally so the use case's R channel stays minimal.
  const renderEmailAdapter: NotificationEmailRenderer = ({ kind, payload, recipient, project }) =>
    Effect.suspend(() => {
      const parsedPayload = payloadSchemaFor(kind).parse(payload)
      const ctx: NotificationEmailRenderContext = { webAppUrl, recipient, project }
      const renderer = NOTIFICATION_EMAIL_RENDERERS[kind]
      // Each renderer in the registry accepts its kind's narrowed payload;
      // payloadSchemaFor already returns the same schema used at the call
      // site, so this cast is safe.
      return renderer(parsedPayload as never, ctx)
    }).pipe(Effect.provide(rendererLayer))

  const sendEmailAdapter: NotificationEmailSender = (message) =>
    transportSendEmail({
      to: message.to,
      subject: message.subject,
      html: message.html,
      ...(message.text !== undefined ? { text: message.text } : {}),
    }).pipe(
      Effect.mapError((cause) => ({
        _tag: "SendNotificationEmailTransportError" as const,
        message: cause.message,
        cause,
      })),
    )

  const runSend = sendNotificationEmailUseCase({
    renderEmail: renderEmailAdapter,
    sendEmail: sendEmailAdapter,
  })

  consumer.subscribe("notification-email", {
    send: (payload) => {
      const orgId = OrganizationId(payload.organizationId)
      return runSend({ notificationId: NotificationId(payload.notificationId) }).pipe(
        Effect.tap((result) =>
          Effect.sync(() =>
            logger.info(`notification-email.send notificationId=${payload.notificationId} sent=${result.sent}`),
          ),
        ),
        Effect.tapError((error) =>
          Effect.sync(() =>
            logger.error(`notification-email.send failed notificationId=${payload.notificationId}`, error),
          ),
        ),
        withPostgres(repoLayer, getPostgresClient(), orgId),
        Effect.asVoid,
        withTracing,
      )
    },
  })
}
