import { completeAuthIntentUseCase, createLoginIntentUseCase, createSignupIntentUseCase } from "@domain/auth"
import {
  createAuthIntentPostgresRepository,
  createAuthUserPostgresRepository,
  createMembershipPostgresRepository,
  createOrganizationPostgresRepository,
  runCommand,
} from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { zodValidator } from "@tanstack/zod-adapter"
import { Effect } from "effect"
import { getPostgresClient } from "../../server/clients.ts"
import { errorHandler } from "../../server/middlewares.ts"
import { ensureSession } from "../sessions/session.functions.ts"
import {
  completeAuthIntentInputSchema,
  createLoginIntentInputSchema,
  createSignupIntentInputSchema,
} from "./auth.types.ts"

export const createLoginIntent = createServerFn({ method: "POST" })
  .middleware([errorHandler])
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
  .middleware([errorHandler])
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
  .middleware([errorHandler])
  .inputValidator(zodValidator(completeAuthIntentInputSchema))
  .handler(async ({ data }) => {
    const session = await ensureSession()
    const { db } = getPostgresClient()

    const userId = session.user.id
    const email = session.user.email
    const name = session.user.name ?? null

    return runCommand(db)(async (txDb) => {
      const intents = createAuthIntentPostgresRepository(txDb)
      const organizations = createOrganizationPostgresRepository(txDb)
      const memberships = createMembershipPostgresRepository(txDb)
      const users = createAuthUserPostgresRepository(txDb)

      return Effect.runPromise(
        completeAuthIntentUseCase({ intents, organizations, memberships, users })({
          intentId: data.intentId,
          session: { userId, email, name },
        }),
      )
    })
  })
