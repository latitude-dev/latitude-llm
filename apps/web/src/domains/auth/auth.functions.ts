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
import { zodValidator } from "@tanstack/zod-adapter"
import { Effect } from "effect"
import { getBetterAuth, getPostgresClient } from "../../server/clients.ts"
import {
  completeAuthIntentInputSchema,
  createLoginIntentInputSchema,
  createSignupIntentInputSchema,
} from "./auth.types.ts"

export const createLoginIntent = createServerFn({ method: "POST" })
  .inputValidator(zodValidator(createLoginIntentInputSchema))
  .handler(async ({ data }) => {
    const { db } = getPostgresClient()

    const intent = await runCommand(db)(async (txDb) => {
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
  .inputValidator(zodValidator(createSignupIntentInputSchema))
  .handler(async ({ data }) => {
    const { db } = getPostgresClient()
    const intent = await runCommand(db)(async (txDb) => {
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
  .inputValidator(zodValidator(completeAuthIntentInputSchema))
  .handler(async ({ data }) => {
    const headers = getRequestHeaders()
    const authApi = getBetterAuth().api
    const session = await authApi.getSession({ headers })

    if (!session?.user) {
      throw new Error("Unauthorized")
    }

    const { db } = getPostgresClient()

    return runCommand(db)(async (txDb) => {
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

      return Effect.runPromise(program)
    })
  })
