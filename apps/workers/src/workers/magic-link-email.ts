import {
  type AuthIntent,
  AuthIntentRepository,
  normalizeEmail,
  resolveMagicLinkEmailTemplateFromContext,
} from "@domain/auth"
import {
  type EmailSender,
  inviteMagicLinkTemplate,
  magicLinkTemplate,
  type RenderedEmail,
  sendEmail,
  signupExistingAccountMagicLinkTemplate,
} from "@domain/email"
import type { MessageHandler, QueueConsumer, QueueMessage } from "@domain/queue"
import { UserRepository } from "@domain/users"
import { AuthIntentRepositoryLive, type PostgresClient, SqlClientLive, UserRepositoryLive } from "@platform/db-postgres"
import { createEmailTransportSender } from "@platform/email-transport"
import { createLogger } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient } from "../clients.ts"
import { parseMagicLinkEmailPayload } from "./magic-link-email-payload.ts"

const logger = createLogger("magic-link-email")

interface MagicLinkEmailWorkerDependencies {
  readonly postgresClient?: PostgresClient
  readonly emailSender?: EmailSender
  readonly logger?: Pick<typeof logger, "info" | "error">
}

export const createMagicLinkEmailWorker = (consumer: QueueConsumer, deps: MagicLinkEmailWorkerDependencies = {}) => {
  const pgClient = deps.postgresClient ?? getPostgresClient()
  const emailSender = deps.emailSender ?? createEmailTransportSender()
  const sendEmailUseCase = sendEmail({ emailSender })
  const workerLogger = deps.logger ?? logger

  const repoLayer = Layer.merge(AuthIntentRepositoryLive, UserRepositoryLive).pipe(
    Layer.provideMerge(SqlClientLive(pgClient)),
  )

  const handler: MessageHandler = {
    handle: (message: QueueMessage) => {
      const payload = parseMagicLinkEmailPayload(message.body)
      if (!payload) {
        workerLogger.error("Magic link email: failed to parse payload")
        return Effect.void
      }

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
          workerLogger.error(`Cannot send magic link: user not found for email ${payload.email}`)
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
          rendered = yield* Effect.tryPromise(() => magicLinkTemplate({ userName, magicLinkUrl: payload.magicLinkUrl }))
        }

        yield* sendEmailUseCase({
          to: normalizedEmail,
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
        })
      }).pipe(
        Effect.tap(() => Effect.sync(() => workerLogger.info(`Magic link email sent to ${payload.email}`))),
        Effect.tapError((error) =>
          Effect.sync(() => workerLogger.error(`Magic link email failed for ${payload.email}`, error)),
        ),
        Effect.provide(repoLayer),
      )
    },
  }

  consumer.subscribe("magic-link-email", handler)
}
