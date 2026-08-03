import { OutboxEventWriter } from "@domain/events"
import {
  type NotFoundError,
  type OrganizationRedactionSetting,
  type RepositoryError,
  SqlClient,
  toRepositoryError,
} from "@domain/shared"
import { Effect } from "effect"
import type { Organization } from "../entities/organization.ts"
import { OrganizationRepository } from "../ports/organization-repository.ts"

export interface UpdateOrganizationRedactionInput {
  readonly actorUserId: string
  /** `null` removes the organization policy, leaving each project to its own. */
  readonly redaction: OrganizationRedactionSetting | null
}

export type UpdateOrganizationRedactionError = RepositoryError | NotFoundError

export const updateOrganizationRedactionUseCase = Effect.fn("organizations.updateOrganizationRedaction")(function* (
  input: UpdateOrganizationRedactionInput,
) {
  yield* Effect.annotateCurrentSpan("actor.userId", input.actorUserId)

  const sqlClient = yield* SqlClient
  const { organizationId } = sqlClient

  return yield* sqlClient.transaction(
    Effect.gen(function* () {
      const repo = yield* OrganizationRepository
      const existing = yield* repo.findByIdForUpdate(organizationId)

      const fromRedaction = existing.settings?.redaction ?? null
      const toRedaction = input.redaction

      if (isSameRedaction(fromRedaction, toRedaction)) return existing

      const { redaction: _dropped, ...settingsWithoutRedaction } = existing.settings ?? {}
      const updated: Organization = {
        ...existing,
        settings: {
          ...settingsWithoutRedaction,
          ...(toRedaction !== null ? { redaction: toRedaction } : {}),
        },
        updatedAt: new Date(),
      }

      yield* repo.save(updated)

      const outboxEventWriter = yield* OutboxEventWriter
      yield* outboxEventWriter
        .write({
          eventName: "OrganizationRedactionPolicyChanged",
          aggregateType: "organization",
          aggregateId: organizationId,
          organizationId,
          payload: {
            organizationId,
            actorUserId: input.actorUserId,
            fromRedaction,
            toRedaction,
          },
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))

      return updated
    }),
  )
})

const isSameRedaction = (a: OrganizationRedactionSetting | null, b: OrganizationRedactionSetting | null): boolean =>
  JSON.stringify(normalizeRedaction(a)) === JSON.stringify(normalizeRedaction(b))

/** Entity order is a UI artifact, so sort before comparing or a reorder reads as a change. */
const normalizeRedaction = (setting: OrganizationRedactionSetting | null) =>
  setting === null
    ? null
    : {
        mode: setting.mode ?? null,
        entities: setting.entities ? [...setting.entities].sort() : null,
        metadata: setting.scopes?.metadata ?? null,
        identities: setting.identities ?? null,
        locked: setting.locked ?? null,
      }
