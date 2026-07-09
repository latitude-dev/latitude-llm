import {
  type ElevenlabsWebhookEndpoint,
  ElevenlabsWebhookEndpointRepository,
  elevenlabsWebhookEndpointSchema,
} from "@domain/elevenlabs"
import {
  ElevenlabsWebhookEndpointId,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SqlClient,
  type SqlClientShape,
  toRepositoryError,
  UserId,
} from "@domain/shared"
import { and, eq, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator, PostgresDb } from "../client.ts"
import { decryptField, encryptField, getEncryptionKey } from "../encryption-key.ts"
import { elevenlabsWebhookEndpoints } from "../schema/elevenlabs-webhook-endpoints.ts"

const toDomain = (
  row: typeof elevenlabsWebhookEndpoints.$inferSelect,
  signingSecret: string,
): ElevenlabsWebhookEndpoint =>
  elevenlabsWebhookEndpointSchema.parse({
    id: ElevenlabsWebhookEndpointId(row.id),
    organizationId: OrganizationId(row.organizationId),
    projectId: ProjectId(row.projectId),
    webhookToken: row.webhookToken,
    signingSecret,
    createdByUserId: UserId(row.createdByUserId),
    revokedAt: row.revokedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

export const findActiveElevenlabsWebhookEndpointByToken = (
  db: PostgresDb,
  webhookToken: string,
  encryptionKey: Uint8Array,
): Effect.Effect<ElevenlabsWebhookEndpoint | null, RepositoryError> =>
  Effect.gen(function* () {
    const rows = yield* Effect.tryPromise({
      try: () =>
        db
          .select()
          .from(elevenlabsWebhookEndpoints)
          .where(
            and(
              eq(elevenlabsWebhookEndpoints.webhookToken, webhookToken),
              isNull(elevenlabsWebhookEndpoints.revokedAt),
            ),
          )
          .limit(1),
      catch: (cause) => toRepositoryError(cause, "findActiveElevenlabsWebhookEndpointByToken"),
    })

    const row = rows[0]
    if (!row) return null
    const signingSecret = yield* decryptField(row.signingSecret, encryptionKey, "decryptElevenlabsWebhookSecret")
    return toDomain(row, signingSecret)
  })

export const ElevenlabsWebhookEndpointRepositoryLive = Layer.effect(
  ElevenlabsWebhookEndpointRepository,
  Effect.gen(function* () {
    const encryptionKey = yield* getEncryptionKey()

    const decryptSecret = (value: string) => decryptField(value, encryptionKey, "decryptElevenlabsWebhookSecret")
    const encryptSecret = (value: string) => encryptField(value, encryptionKey, "encryptElevenlabsWebhookSecret")

    return {
      findActiveByProjectId: (projectId: ProjectId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(elevenlabsWebhookEndpoints)
                .where(
                  and(
                    eq(elevenlabsWebhookEndpoints.projectId, projectId),
                    eq(elevenlabsWebhookEndpoints.organizationId, organizationId),
                    isNull(elevenlabsWebhookEndpoints.revokedAt),
                  ),
                )
                .limit(1),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "findActiveElevenlabsWebhookEndpointByProject")))

          const row = rows[0]
          if (!row) return null
          const signingSecret = yield* decryptSecret(row.signingSecret)
          return toDomain(row, signingSecret)
        }),

      findActiveByWebhookToken: (webhookToken: string) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(elevenlabsWebhookEndpoints)
                .where(
                  and(
                    eq(elevenlabsWebhookEndpoints.webhookToken, webhookToken),
                    eq(elevenlabsWebhookEndpoints.organizationId, organizationId),
                    isNull(elevenlabsWebhookEndpoints.revokedAt),
                  ),
                )
                .limit(1),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "findActiveElevenlabsWebhookEndpointByToken")))

          const row = rows[0]
          if (!row) return null
          const signingSecret = yield* decryptSecret(row.signingSecret)
          return toDomain(row, signingSecret)
        }),

      save: (endpoint: ElevenlabsWebhookEndpoint) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const encryptedSecret = yield* encryptSecret(endpoint.signingSecret)
          yield* sqlClient
            .query((db, organizationId) =>
              db.insert(elevenlabsWebhookEndpoints).values({
                id: endpoint.id,
                organizationId,
                projectId: endpoint.projectId,
                webhookToken: endpoint.webhookToken,
                signingSecret: encryptedSecret,
                createdByUserId: endpoint.createdByUserId,
                revokedAt: endpoint.revokedAt,
                createdAt: endpoint.createdAt,
                updatedAt: endpoint.updatedAt,
              }),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "saveElevenlabsWebhookEndpoint")))
        }),

      softRevokeById: (id: ElevenlabsWebhookEndpointId, revokedAt: Date) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) =>
              db
                .update(elevenlabsWebhookEndpoints)
                .set({ revokedAt, updatedAt: revokedAt })
                .where(
                  and(
                    eq(elevenlabsWebhookEndpoints.id, id),
                    eq(elevenlabsWebhookEndpoints.organizationId, organizationId),
                    isNull(elevenlabsWebhookEndpoints.revokedAt),
                  ),
                ),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "revokeElevenlabsWebhookEndpoint")))
        }),
    }
  }),
)
