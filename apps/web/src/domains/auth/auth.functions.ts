import { completeAuthIntentUseCase, createLoginIntentUseCase, createSignupIntentUseCase } from "@domain/auth"
import {
  createAuthIntentPostgresRepository,
  createAuthUserPostgresRepository,
  createMembershipPostgresRepository,
  createOrganizationPostgresRepository,
  runCommand,
} from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { Effect } from "effect"
import { getBetterAuth, getPostgresClient } from "../../server/clients.ts"

type CreateLoginIntentInput = {
  readonly email: string
}

type CreateSignupIntentInput = {
  readonly name: string
  readonly email: string
  readonly organizationName: string
}

type CompleteAuthIntentInput = {
  readonly intentId: string
}

interface SessionResponse {
  readonly user: {
    readonly id: string
    readonly email: string
    readonly name?: string | null
  }
}

interface BetterAuthApi {
  getSession: (options: {
    readonly headers?: Headers
  }) => Promise<SessionResponse | null>
  signOut: (options: {
    readonly headers?: Headers
  }) => Promise<unknown>
}

export const createLoginIntent = createServerFn({ method: "POST" })
  .inputValidator((data: CreateLoginIntentInput) => data)
  .handler(async ({ data }) => {
    const { db } = getPostgresClient()

    const intent = await runCommand(db, async (txDb) => {
      const intents = createAuthIntentPostgresRepository(txDb)
      const users = createAuthUserPostgresRepository(txDb)

      return Effect.runPromise(
        createLoginIntentUseCase({ intents, users })({
          email: data.email,
        }),
      )
    })

    return { intentId: intent.id }
  })

export const createSignupIntent = createServerFn({ method: "POST" })
  .inputValidator((data: CreateSignupIntentInput) => data)
  .handler(async ({ data }) => {
    const { db } = getPostgresClient()
    const intent = await runCommand(db, async (txDb) => {
      const intents = createAuthIntentPostgresRepository(txDb)
      const users = createAuthUserPostgresRepository(txDb)

      return Effect.runPromise(
        createSignupIntentUseCase({ intents, users })({
          name: data.name,
          email: data.email,
          organizationName: data.organizationName,
        }),
      )
    })

    return {
      intentId: intent.id,
      existingAccountAtRequest: intent.existingAccountAtRequest,
    }
  })

export const completeAuthIntent = createServerFn({ method: "POST" })
  .inputValidator((data: CompleteAuthIntentInput) => data)
  .handler(async ({ data }) => {
    const headers = getRequestHeaders()
    const authApi = getBetterAuth().api as unknown as BetterAuthApi
    const session = await authApi.getSession({ headers })

    if (!session?.user) {
      throw new Error("Unauthorized")
    }

    const { db } = getPostgresClient()

    return runCommand(db, async (txDb) => {
      const intents = createAuthIntentPostgresRepository(txDb)
      const users = createAuthUserPostgresRepository(txDb)
      const memberships = createMembershipPostgresRepository(txDb)
      const organizations = createOrganizationPostgresRepository(txDb)
      const program = completeAuthIntentUseCase({
        intents,
        organizations,
        memberships,
        users,
      })({
        intentId: data.intentId,
        session: {
          userId: session.user.id,
          email: session.user.email,
          name: session.user.name ?? null,
        },
      })

      return Effect.runPromise(program as Effect.Effect<{ completed: true }, unknown, never>)
    })
  })

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const authApi = getBetterAuth().api as unknown as BetterAuthApi
  const headers = getRequestHeaders()

  await authApi.signOut({ headers })
})
