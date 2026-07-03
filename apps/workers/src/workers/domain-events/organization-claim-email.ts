import { organizationClaimTemplate, sendEmail } from "@domain/email"
import type { QueueConsumer } from "@domain/queue"
import { createEmailTransportSender } from "@platform/email-transport"
import { createLogger, withTracing } from "@repo/observability"
import { Effect } from "effect"

const logger = createLogger("organization-claim-email")
const normalizeEmail = (email: string) => email.trim().toLowerCase()

interface OrganizationClaimEmailDeps {
  consumer: QueueConsumer
}

export const createOrganizationClaimEmailWorker = ({ consumer }: OrganizationClaimEmailDeps) => {
  consumer.subscribe("organization-claim-email", {
    send: (payload) => {
      const emailSender = createEmailTransportSender()
      const sendEmailUseCase = sendEmail({ emailSender })

      return Effect.gen(function* () {
        const normalizedEmail = normalizeEmail(payload.email)

        const rendered = yield* Effect.tryPromise(() =>
          organizationClaimTemplate({
            claimUrl: payload.claimUrl,
            organizationName: payload.organizationName,
            expiresAt: payload.expiresAt,
          }),
        )

        yield* sendEmailUseCase({
          to: normalizedEmail,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        })
      }).pipe(
        Effect.tap(() => Effect.sync(() => logger.info(`Claim email sent to ${payload.email}`))),
        Effect.tapError((error) => Effect.sync(() => logger.error(`Claim email failed for ${payload.email}`, error))),
        withTracing,
      )
    },
  })
}
