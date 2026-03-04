import { ApiKeyRepository, generateApiKeyUseCase } from "@domain/api-keys"
import {
  AuthIntentRepository,
  AuthUserRepository,
  completeAuthIntentUseCase,
  createLoginIntentUseCase,
  createSignupIntentUseCase,
} from "@domain/auth"
import { MembershipRepository, OrganizationRepository } from "@domain/organizations"
import { OrganizationId } from "@domain/shared"
import {
  createApiKeyPostgresRepository,
  createAuthIntentPostgresRepository,
  createAuthUserPostgresRepository,
  createMembershipPostgresRepository,
  createOrganizationPostgresRepository,
  runCommand,
} from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect } from "effect"
import { z } from "zod"
import { getAdminPostgresClient, getRedisClient } from "../../server/clients.ts"
import { errorHandler } from "../../server/middlewares.ts"
import { ensureSession } from "../sessions/session.functions.ts"
import {
  completeAuthIntentInputSchema,
  createLoginIntentInputSchema,
  createSignupIntentInputSchema,
  getAuthIntentInfoInputSchema,
} from "./auth.types.ts"

const CLI_SESSION_KEY_PREFIX = "cli:session"
const getCliSessionKey = (token: string) => `${CLI_SESSION_KEY_PREFIX}:${token}`

const provideAuthServices = <A, E>(
  effect: Effect.Effect<A, E, AuthIntentRepository | AuthUserRepository>,
  txDb: Parameters<typeof createAuthIntentPostgresRepository>[0],
) =>
  effect.pipe(
    Effect.provideService(AuthIntentRepository, createAuthIntentPostgresRepository(txDb)),
    Effect.provideService(AuthUserRepository, createAuthUserPostgresRepository(txDb)),
  )

export const createLoginIntent = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(createLoginIntentInputSchema)
  .handler(async ({ data }) => {
    const { db } = getAdminPostgresClient()

    const intent = await runCommand(db)(async (txDb) =>
      Effect.runPromise(provideAuthServices(createLoginIntentUseCase({ email: data.email }), txDb)),
    )

    return { intentId: intent.id }
  })

export const createSignupIntent = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(createSignupIntentInputSchema)
  .handler(async ({ data }) => {
    const { db } = getAdminPostgresClient()

    const intent = await runCommand(db)(async (txDb) =>
      Effect.runPromise(
        provideAuthServices(
          createSignupIntentUseCase({
            name: data.name,
            email: data.email,
            organizationName: data.organizationName,
          }),
          txDb,
        ),
      ),
    )

    return {
      intentId: intent.id,
      existingAccountAtRequest: intent.existingAccountAtRequest,
    }
  })

export interface AuthIntentInfo {
  readonly type: "login" | "signup" | "invite"
  readonly needsName: boolean
  readonly organizationName: string | null
}

export const getAuthIntentInfo = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(getAuthIntentInfoInputSchema)
  .handler(async ({ data }): Promise<AuthIntentInfo> => {
    const session = await ensureSession()
    const { db } = getAdminPostgresClient()

    return runCommand(db)(async (txDb) => {
      const intents = createAuthIntentPostgresRepository(txDb)
      const intent = await Effect.runPromise(
        intents.findById(data.intentId).pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null))),
      )

      if (!intent) {
        return { type: "login" as const, needsName: false, organizationName: null }
      }

      const userHasName = !!session.user.name && session.user.name.trim().length > 0
      const needsName = intent.type === "invite" && !intent.existingAccountAtRequest && !userHasName

      return {
        type: intent.type,
        needsName,
        organizationName: intent.data.invite?.organizationName ?? null,
      }
    })
  })

export const completeAuthIntent = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(completeAuthIntentInputSchema)
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const { db } = getAdminPostgresClient()

    const userId = session.user.id
    const email = session.user.email
    const name = data.name ?? session.user.name ?? null

    return runCommand(db)(async (txDb) =>
      Effect.runPromise(
        completeAuthIntentUseCase({
          intentId: data.intentId,
          session: { userId, email, name },
        }).pipe(
          Effect.provideService(AuthIntentRepository, createAuthIntentPostgresRepository(txDb)),
          Effect.provideService(AuthUserRepository, createAuthUserPostgresRepository(txDb)),
          Effect.provideService(MembershipRepository, createMembershipPostgresRepository(txDb)),
          Effect.provideService(OrganizationRepository, createOrganizationPostgresRepository(txDb)),
        ),
      ),
    )
  })

export const exchangeCliSession = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(z.object({ sessionToken: z.string() }))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const redis = getRedisClient()

    const cliSessionKey = getCliSessionKey(data.sessionToken)

    const raw = await redis.get(cliSessionKey)
    if (!raw) {
      throw new Error("CLI session not found or expired")
    }

    const cliSession = JSON.parse(raw) as { status: string }
    if (cliSession.status !== "pending") {
      throw new Error("CLI session already consumed")
    }

    const sessionData = session.session as Record<string, unknown>
    const activeOrganizationId = sessionData.activeOrganizationId as string | undefined

    if (!activeOrganizationId) {
      throw new Error("No active organization. Please complete your account setup first.")
    }

    const organizationId = OrganizationId(activeOrganizationId)
    const { db } = getAdminPostgresClient()

    const createdAt = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const apiKey = await runCommand(db)(async (txDb) =>
      Effect.runPromise(
        generateApiKeyUseCase({ organizationId, name: `CLI (${createdAt})` }).pipe(
          Effect.provideService(ApiKeyRepository, createApiKeyPostgresRepository(txDb)),
        ),
      ),
    )

    await redis.setex(
      cliSessionKey,
      600, // 10 minutes to poll
      JSON.stringify({
        status: "authenticated",
        token: apiKey.token,
        organizationId: activeOrganizationId,
      }),
    )
  })
