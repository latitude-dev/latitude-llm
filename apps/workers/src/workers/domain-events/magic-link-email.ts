import {
  type AuthIntent,
  AuthIntentRepository,
  normalizeEmail,
  resolveMagicLinkEmailTemplateFromContext,
} from "@domain/auth"
import {
  inviteMagicLinkTemplate,
  magicLinkTemplate,
  type RenderedEmail,
  sendEmail,
  signupExistingAccountMagicLinkTemplate,
} from "@domain/email"
import type { QueueConsumer } from "@domain/queue"
import { UserRepository } from "@domain/users"
import { AuthIntentRepositoryLive, SqlClientLive, UserRepositoryLive } from "@platform/db-postgres"
import { createEmailTransportSender } from "@platform/email-transport"
import { createEventHandler } from "@platform/queue-bullmq"
import { createLogger } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient } from "../../clients.ts"

const logger = createLogger("magic-link-email")

export const createMagicLinkEmailWorker = (consumer: QueueConsumer) => {
  consumer.subscribe(
    "magic-link-email",
    createEventHandler({
      handle: (event) => {
        const payload = event.event.payload as {
          email: string
          magicLinkUrl: string
          authIntentId: string | null
        }

        const pgClient = getPostgresClient()
        const emailSender = createEmailTransportSender()
        const sendEmailUseCase = sendEmail({ emailSender })

        const repoLayer = Layer.merge(AuthIntentRepositoryLive, UserRepositoryLive).pipe(
          Layer.provideMerge(SqlClientLive(pgClient)),
        )

        return Effect.gen(function* () {
          let authIntentContext:
            | {
                readonly type: AuthIntent["type"]
                readonly existingAccountAtRequest: boolean
                readonly signupName?: string
                readonly inviterName?: string
                readonly organizationName?: string
              }
            | undefined

          if (payload.authIntentId) {
            const authIntentRepo = yield* AuthIntentRepository
            const authIntent = yield* authIntentRepo
              .findById(payload.authIntentId)
              .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

            if (authIntent) {
              authIntentContext = {
                type: authIntent.type,
                existingAccountAtRequest: authIntent.existingAccountAtRequest,
                ...(authIntent.data.signup?.name ? { signupName: authIntent.data.signup.name } : {}),
                ...(authIntent.data.invite?.inviterName ? { inviterName: authIntent.data.invite.inviterName } : {}),
                ...(authIntent.data.invite?.organizationName
                  ? { organizationName: authIntent.data.invite.organizationName }
                  : {}),
              }
            }
          }

          const normalizedEmail = normalizeEmail(payload.email)

          const userRepo = yield* UserRepository
          const user = yield* userRepo
            .findByEmail(normalizedEmail)
            .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

          const allowsUnknownUser = authIntentContext
            ? authIntentContext.type === "signup" || authIntentContext.type === "invite"
            : false

          if (!user && !allowsUnknownUser) {
            logger.error(`Cannot send magic link: user not found for email ${payload.email}`)
            return
          }

          const userName = user?.name ?? authIntentContext?.signupName ?? "there"
          const template = authIntentContext
            ? resolveMagicLinkEmailTemplateFromContext({
                type: authIntentContext.type,
                existingAccountAtRequest: authIntentContext.existingAccountAtRequest,
              })
            : "default"

          let rendered: RenderedEmail

          if (template === "invite") {
            rendered = yield* Effect.tryPromise(() =>
              inviteMagicLinkTemplate({
                inviterName: authIntentContext?.inviterName ?? "Someone",
                organizationName: authIntentContext?.organizationName ?? "a workspace",
                magicLinkUrl: payload.magicLinkUrl,
              }),
            )
          } else if (template === "signupExistingAccount") {
            rendered = yield* Effect.tryPromise(() =>
              signupExistingAccountMagicLinkTemplate({ userName, magicLinkUrl: payload.magicLinkUrl }),
            )
          } else {
            rendered = yield* Effect.tryPromise(() =>
              magicLinkTemplate({ userName, magicLinkUrl: payload.magicLinkUrl }),
            )
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
        )
      },
    }),
  )
}
