import { magicLinkTemplate, sendEmail } from "@domain/email"
import type { QueueConsumer } from "@domain/queue"
import { createEmailTransportSender } from "@platform/email-transport"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("magic-link-email")
const normalizeEmail = (email: string) => email.trim().toLowerCase()

interface MagicLinkEmailDeps {
  consumer: QueueConsumer
}

export const createMagicLinkEmailWorker = ({ consumer }: MagicLinkEmailDeps) => {
  consumer.subscribe("magic-link-email", {
    send: (payload) => {
      const emailSender = createEmailTransportSender()
      const sendEmailUseCase = sendEmail({ emailSender })

      return Effect.gen(function* () {
        const normalizedEmail = normalizeEmail(payload.email)
        const rendered = yield* Effect.tryPromise(() =>
          magicLinkTemplate({ userName: "there", magicLinkUrl: payload.magicLinkUrl }),
        )

        yield* sendEmailUseCase({
          to: normalizedEmail,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        })
      }).pipe(
        Effect.tap(() => Effect.sync(() => logger.info(`Magic link email sent to ${payload.email}`))),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`Magic link email failed for ${payload.email}`, error)),
        ),
        withTracing,
      )
    },
  })
}
