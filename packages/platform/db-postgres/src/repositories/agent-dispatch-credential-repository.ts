import { AgentDispatchCredentialRepository } from "@domain/agent-dispatch"
import { SqlClient, type SqlClientShape, toRepositoryError } from "@domain/shared"
import { and, eq } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { decryptField, encryptField, getEncryptionKey } from "../encryption-key.ts"
import { agentDispatchCredentials } from "../schema/agent-dispatch-credentials.ts"

export const AgentDispatchCredentialRepositoryLive = Layer.effect(
  AgentDispatchCredentialRepository,
  Effect.gen(function* () {
    const encryptionKey = yield* getEncryptionKey()

    const decryptNullable = (value: string | null) =>
      value === null ? Effect.succeed(null) : decryptField(value, encryptionKey, "decryptAgentDispatchCredential")

    const encryptNullable = (value: string | null | undefined) =>
      value === null || value === undefined
        ? Effect.succeed(null)
        : encryptField(value, encryptionKey, "encryptAgentDispatchCredential")

    return {
      getDecrypted: (integrationId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const rows = yield* sqlClient
            .query((db, organizationId) =>
              db
                .select()
                .from(agentDispatchCredentials)
                .where(
                  and(
                    eq(agentDispatchCredentials.integrationId, integrationId),
                    eq(agentDispatchCredentials.organizationId, organizationId),
                  ),
                )
                .limit(1),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "getAgentDispatchCredentials")))

          const row = rows[0]
          if (!row) {
            return {
              cursorApiKey: null,
              claudeRoutineToken: null,
              linearApiKey: null,
              webhookSecret: null,
            }
          }

          const [cursorApiKey, claudeRoutineToken, linearApiKey, webhookSecret] = yield* Effect.all([
            decryptNullable(row.cursorApiKey),
            decryptNullable(row.claudeRoutineToken),
            decryptNullable(row.linearApiKey),
            decryptNullable(row.webhookSecret),
          ])

          return { cursorApiKey, claudeRoutineToken, linearApiKey, webhookSecret }
        }),

      upsert: (input) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          const [cursorApiKey, claudeRoutineToken, linearApiKey, webhookSecret] = yield* Effect.all([
            encryptNullable(input.cursorApiKey),
            encryptNullable(input.claudeRoutineToken),
            encryptNullable(input.linearApiKey),
            encryptNullable(input.webhookSecret),
          ])

          yield* sqlClient
            .query((db, organizationId) =>
              db
                .insert(agentDispatchCredentials)
                .values({
                  integrationId: input.integrationId,
                  organizationId,
                  cursorApiKey,
                  claudeRoutineToken,
                  linearApiKey,
                  webhookSecret,
                })
                .onConflictDoUpdate({
                  target: agentDispatchCredentials.integrationId,
                  set: {
                    cursorApiKey,
                    claudeRoutineToken,
                    linearApiKey,
                    webhookSecret,
                    updatedAt: new Date(),
                  },
                }),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "upsertAgentDispatchCredentials")))
        }),

      delete: (integrationId) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
          yield* sqlClient
            .query((db, organizationId) =>
              db
                .delete(agentDispatchCredentials)
                .where(
                  and(
                    eq(agentDispatchCredentials.integrationId, integrationId),
                    eq(agentDispatchCredentials.organizationId, organizationId),
                  ),
                ),
            )
            .pipe(Effect.mapError((e) => toRepositoryError(e, "deleteAgentDispatchCredentials")))
        }),
    }
  }),
)
