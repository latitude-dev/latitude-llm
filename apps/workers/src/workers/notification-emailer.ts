import { NOTIFICATION_EMAIL_RENDERERS, type NotificationEmailRenderContext, sendEmail } from "@domain/email"
import {
  type NotificationEmailRenderer,
  type NotificationEmailSender,
  payloadSchemaFor,
  sendNotificationEmailUseCase,
} from "@domain/notifications"
import type { QueueConsumer } from "@domain/queue"
import { NotificationId, OrganizationId } from "@domain/shared"
import { NotificationRepositoryLive, UserRepositoryLive, withPostgres } from "@platform/db-postgres"
import { createEmailTransportSender } from "@platform/email-transport"
import { parseEnv } from "@platform/env"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient } from "../clients.ts"

const logger = createLogger("notification-emailer")

interface NotificationEmailerDeps {
  consumer: QueueConsumer
}

const repoLayer = Layer.mergeAll(NotificationRepositoryLive, UserRepositoryLive)

const resolveWebAppUrl = (): string => {
  const webUrl = Effect.runSync(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000"))
  return webUrl.replace(/\/$/, "")
}

/**
 * Channel worker: consumes `notification-email:send` tasks, looks up the
 * stored notification + recipient, dispatches to the per-kind email
 * template via the registry, then sends through the email transport.
 *
 * Idempotency: `sendNotificationEmailUseCase` claims the right to send
 * by stamping `emailed_at` (conditional on `IS NULL`); a redelivered
 * job that finds the row already stamped exits silently.
 */
export const createNotificationEmailerWorker = ({ consumer }: NotificationEmailerDeps) => {
  const emailTransport = createEmailTransportSender()
  const transportSendEmail = sendEmail({ emailSender: emailTransport })
  const webAppUrl = resolveWebAppUrl()

  // Adapter: the domain use case takes its own opaque error tags so it
  // doesn't depend on @domain/email types. Wrap the registry dispatch and
  // the transport-level send to match the use case's contract.
  const renderEmailAdapter: NotificationEmailRenderer = ({ kind, payload, recipient }) =>
    Effect.tryPromise({
      try: async () => {
        const parsedPayload = payloadSchemaFor(kind).parse(payload)
        const ctx: NotificationEmailRenderContext = { webAppUrl, recipient }
        const renderer = NOTIFICATION_EMAIL_RENDERERS[kind]
        // Each renderer in the registry accepts its kind's narrowed payload;
        // payloadSchemaFor already returns the same schema used at the call
        // site, so this cast is safe.
        return renderer(parsedPayload as never, ctx)
      },
      catch: (cause) => ({
        _tag: "RenderNotificationEmailError" as const,
        message: cause instanceof Error ? cause.message : "Failed to render notification email",
        cause,
      }),
    })

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
