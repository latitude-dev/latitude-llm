import { inviteMagicLinkTemplate, sendEmail } from "@domain/email"
import type { QueueConsumer } from "@domain/queue"
import { createEmailTransportSender } from "@platform/email-transport"
import { createLogger } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("invitation-email")
const normalizeEmail = (email: string) => email.trim().toLowerCase()

interface InvitationEmailDeps {
  consumer: QueueConsumer
}

export const createInvitationEmailWorker = ({ consumer }: InvitationEmailDeps) => {
  consumer.subscribe("invitation-email", {
    send: (payload) => {
      const emailSender = createEmailTransportSender()
      const sendEmailUseCase = sendEmail({ emailSender })

      return Effect.gen(function* () {
        const normalizedEmail = normalizeEmail(payload.email)

        const rendered = yield* Effect.tryPromise(() =>
          inviteMagicLinkTemplate({
            inviterName: payload.inviterName,
            organizationName: payload.organizationName,
            magicLinkUrl: payload.invitationUrl,
          }),
        )

        yield* sendEmailUseCase({
          to: normalizedEmail,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        })
      }).pipe(
        Effect.tap(() => Effect.sync(() => logger.info(`Invitation email sent to ${payload.email}`))),
        Effect.tapError((error) =>
          Effect.sync(() => logger.error(`Invitation email failed for ${payload.email}`, error)),
        ),
      )
    },
  })
}
