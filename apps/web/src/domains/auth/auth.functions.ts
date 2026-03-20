import { generateApiKeyUseCase } from "@domain/api-keys"
import {
  AuthIntentRepository,
  completeAuthIntentUseCase,
  createLoginIntentUseCase,
  createSignupIntentUseCase,
} from "@domain/auth"
import { isValidId, OrganizationId } from "@domain/shared"
import {
  ApiKeyRepositoryLive,
  AuthIntentRepositoryLive,
  MembershipRepositoryLive,
  OrganizationRepositoryLive,
  UserRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { getAdminPostgresClient, getBetterAuth, getPostgresClient, getRedisClient } from "../../server/clients.ts"
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

export const createLoginIntent = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(createLoginIntentInputSchema)
  .handler(async ({ data }) => {
    const adminClient = getAdminPostgresClient()
    if (data.intentId && !isValidId(data.intentId)) {
      throw new Error("Invalid intent id")
    }

    const intent = await Effect.runPromise(
      createLoginIntentUseCase({
        email: data.email,
        ...(data.intentId ? { intentId: data.intentId } : {}),
      }).pipe(
        withPostgres(Layer.mergeAll(UserRepositoryLive, AuthIntentRepositoryLive), adminClient),
      ),
    )

    return { intentId: intent.id }
  })

export const createSignupIntent = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(createSignupIntentInputSchema)
  .handler(async ({ data }) => {
    const adminClient = getAdminPostgresClient()
    if (data.intentId && !isValidId(data.intentId)) {
      throw new Error("Invalid intent id")
    }

    const intent = await Effect.runPromise(
      createSignupIntentUseCase({
        name: data.name,
        email: data.email,
        organizationName: data.organizationName,
        ...(data.intentId ? { intentId: data.intentId } : {}),
      }).pipe(withPostgres(Layer.mergeAll(UserRepositoryLive, AuthIntentRepositoryLive), adminClient)),
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
    const adminClient = getAdminPostgresClient()

    const intent = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* AuthIntentRepository
        return yield* repo.findById(data.intentId).pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
      }).pipe(withPostgres(AuthIntentRepositoryLive, adminClient)),
    )

    if (!intent) {
      return { type: "login" as const, needsName: false, organizationName: null }
    }

    const userHasName = !!session.user.name && session.user.name.trim().length > 0
    const needsName = intent.type === "invite" && !intent.existingAccountAtRequest && !userHasName

    return {
      type: intent.type,
      needsName,
      organizationName: intent.data?.invite?.organizationName ?? null,
    }
  })

export const completeAuthIntent = createServerFn({ method: "POST" })
  .middleware([errorHandler])
  .inputValidator(completeAuthIntentInputSchema)
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const adminClient = getAdminPostgresClient()
    const userId = session.user.id
    const email = session.user.email
    const name = data.name ?? session.user.name ?? null

    await Effect.runPromise(
      completeAuthIntentUseCase({
        intentId: data.intentId,
        session: { userId, email, name },
      }).pipe(
        withPostgres(
          Layer.mergeAll(
            AuthIntentRepositoryLive,
            MembershipRepositoryLive,
            UserRepositoryLive,
            OrganizationRepositoryLive,
          ),
          adminClient,
        ),
      ),
    )

    // Better Auth session.cookieCache can keep serving the user object from before provisioning
    // (e.g. empty name) even after the use case updates the user row. Bypassing the cache here
    // reloads from the database and rewrites the session data cookie so the client sees fresh fields.
    const auth = getBetterAuth()
    await auth.api.getSession({
      headers: getRequestHeaders(),
      query: { disableCookieCache: true },
    })
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

    const client = getPostgresClient()
    const createdAt = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const apiKey = await Effect.runPromise(
      generateApiKeyUseCase({ name: `CLI (${createdAt})` }).pipe(
        withPostgres(ApiKeyRepositoryLive, client, OrganizationId(activeOrganizationId)),
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
