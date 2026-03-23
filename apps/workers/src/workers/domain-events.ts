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
import type { EventEnvelope } from "@domain/events"
import type { QueueConsumer } from "@domain/queue"
import { UserRepository } from "@domain/users"
import { AuthIntentRepositoryLive, type PostgresClient, SqlClientLive, UserRepositoryLive } from "@platform/db-postgres"
import { createEmailTransportSender } from "@platform/email-transport"
import { createEventHandler } from "@platform/queue-bullmq"
import { createLogger } from "@repo/observability"
import { Effect, Layer } from "effect"
import { getPostgresClient } from "../clients.ts"

const logger = createLogger("domain-events")

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EventHandlerFn = (event: EventEnvelope) => Effect.Effect<void, unknown>

/**
 * Registry mapping event names to one or more handler functions.
 * To handle a new event, add an entry to this map.
 */
type EventHandlerRegistry = Record<string, EventHandlerFn[]>

// ---------------------------------------------------------------------------
// Dependencies wired once at worker start
// ---------------------------------------------------------------------------

interface DomainEventsWorkerDependencies {
  readonly postgresClient?: PostgresClient
  readonly emailSender?: EmailSender
  readonly logger?: Pick<typeof logger, "info" | "error">
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

const handleMagicLinkEmailRequested = (
  repoLayer: Layer.Layer<AuthIntentRepository | UserRepository>,
  sendEmailUseCase: ReturnType<typeof sendEmail>,
  workerLogger: Pick<typeof logger, "info" | "error">,
): EventHandlerFn => {
  return (event: EventEnvelope): Effect.Effect<void, unknown> => {
    const payload = event.event.payload as {
      email: string
      magicLinkUrl: string
      authIntentId: string | null
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
  }
}

// ---------------------------------------------------------------------------
// Registry builder
// ---------------------------------------------------------------------------

const buildHandlerRegistry = (
  repoLayer: Layer.Layer<AuthIntentRepository | UserRepository>,
  sendEmailUseCase: ReturnType<typeof sendEmail>,
  workerLogger: Pick<typeof logger, "info" | "error">,
): EventHandlerRegistry => ({
  MagicLinkEmailRequested: [handleMagicLinkEmailRequested(repoLayer, sendEmailUseCase, workerLogger)],
})

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

const createEventDispatcher = (
  registry: EventHandlerRegistry,
  workerLogger: Pick<typeof logger, "info" | "error">,
) => ({
  handle: (event: EventEnvelope): Effect.Effect<void, unknown> => {
    const handlers = registry[event.event.name]

    if (!handlers || handlers.length === 0) {
      return Effect.sync(() =>
        workerLogger.info(`No handlers for event ${event.event.name} (id=${event.id}), skipping`),
      )
    }

    return Effect.all(
      handlers.map((handler) => handler(event)),
      { concurrency: "unbounded" },
    ).pipe(Effect.asVoid)
  },
})

// ---------------------------------------------------------------------------
// Worker entry point
// ---------------------------------------------------------------------------

export const createDomainEventsWorker = (consumer: QueueConsumer, deps: DomainEventsWorkerDependencies = {}) => {
  const pgClient = deps.postgresClient ?? getPostgresClient()
  const emailSender = deps.emailSender ?? createEmailTransportSender()
  const sendEmailUseCase = sendEmail({ emailSender })
  const workerLogger = deps.logger ?? logger

  const repoLayer = Layer.merge(AuthIntentRepositoryLive, UserRepositoryLive).pipe(
    Layer.provideMerge(SqlClientLive(pgClient)),
  )

  const registry = buildHandlerRegistry(repoLayer, sendEmailUseCase, workerLogger)
  const dispatcher = createEventDispatcher(registry, workerLogger)

  consumer.subscribe("domain-events", createEventHandler(dispatcher))
}
