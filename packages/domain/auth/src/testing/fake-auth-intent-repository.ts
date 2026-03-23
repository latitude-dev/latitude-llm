import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import type { AuthIntentRepository } from "../ports/auth-intent-repository.ts"
import type { AuthIntent } from "../types.ts"

type AuthIntentRepositoryShape = (typeof AuthIntentRepository)["Service"]

export interface FakeAuthIntentState {
  readonly intents: Map<string, AuthIntent>
  readonly consumed: Map<string, { intentId: string; createdOrganizationId?: string }>
}

export const createFakeAuthIntentRepository = (overrides?: Partial<AuthIntentRepositoryShape>) => {
  const intents = new Map<string, AuthIntent>()
  const consumed = new Map<string, { intentId: string; createdOrganizationId?: string }>()

  const repository: AuthIntentRepositoryShape = {
    save: (intent) =>
      Effect.sync(() => {
        intents.set(intent.id, intent)
      }),

    findById: (id) =>
      Effect.gen(function* () {
        const intent = intents.get(id)
        if (!intent) return yield* new NotFoundError({ entity: "AuthIntent", id })
        return intent
      }),

    markConsumed: (params) =>
      Effect.sync(() => {
        consumed.set(params.intentId, params)
        const intent = intents.get(params.intentId)
        if (intent) {
          intents.set(params.intentId, { ...intent, consumedAt: new Date() })
        }
      }),

    findPendingInvitesByOrganizationId: () => Effect.succeed([]),
    ...overrides,
  }

  return { repository, intents, consumed }
}
