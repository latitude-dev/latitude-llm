import { magicLinkTemplate, type RenderedEmail, sendEmail, signupMagicLinkTemplate } from "@domain/email"
import type { QueueConsumer } from "@domain/queue"
import { UserRepository } from "@domain/users"
import { SqlClientLive, UserRepositoryLive } from "@platform/db-postgres"
import { createEmailTransportSender } from "@platform/email-transport"
import { createLogger, withTracing } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient } from "../../clients.ts"

const logger = createLogger("magic-link-email")
const normalizeEmail = (email: string) => email.trim().toLowerCase()

interface MagicLinkEmailDeps {
  consumer: QueueConsumer
}

export const createMagicLinkEmailWorker = ({ consumer }: MagicLinkEmailDeps) => {
  consumer.subscribe("magic-link-email", {
    send: (payload) => {
      const pgClient = getPostgresClient()
      const emailSender = createEmailTransportSender()
      const sendEmailUseCase = sendEmail({ emailSender })

      const repoLayer = UserRepositoryLive.pipe(Layer.provideMerge(SqlClientLive(pgClient)))

      return Effect.gen(function* () {
        const normalizedEmail = normalizeEmail(payload.email)

        const userRepo = yield* UserRepository
        const user = yield* userRepo
          .findByEmail(normalizedEmail)
          .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

        const userName = user?.name ?? "there"

        let rendered: RenderedEmail

        if (payload.emailFlow === "signup") {
          rendered = yield* Effect.tryPromise(() =>
            signupMagicLinkTemplate({ userName, magicLinkUrl: payload.magicLinkUrl }),
          )
        } else {
          rendered = yield* Effect.tryPromise(() => magicLinkTemplate({ userName, magicLinkUrl: payload.magicLinkUrl }))
        }

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
        Effect.provide(repoLayer),
        withTracing,
      )
    },
  })
}
