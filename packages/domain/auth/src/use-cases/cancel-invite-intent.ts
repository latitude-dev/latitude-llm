import { NotFoundError } from "@domain/shared"
import { Effect } from "effect"
import { AuthIntentRepository } from "../ports/auth-intent-repository.ts"

export const cancelInviteIntentUseCase = (input: { intentId: string; organizationId: string }) =>
  Effect.gen(function* () {
    const intents = yield* AuthIntentRepository
    const intent = yield* intents.findById(input.intentId)

    if (intent.type !== "invite") {
      return yield* new NotFoundError({
        entity: "InviteIntent",
        id: input.intentId,
      })
    }

    const inviteOrganizationId = intent.data.invite?.organizationId
    if (!inviteOrganizationId || inviteOrganizationId !== input.organizationId) {
      return yield* new NotFoundError({
        entity: "InviteIntent",
        id: input.intentId,
      })
    }

    if (intent.consumedAt) {
      return
    }

    yield* intents.markConsumed({
      intentId: input.intentId,
    })
  })
