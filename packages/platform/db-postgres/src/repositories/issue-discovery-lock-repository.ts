import { IssueDiscoveryLockRepository, IssueDiscoveryLockUnavailableError } from "@domain/issues"
import { SqlClient, type SqlClientShape } from "@domain/shared"
import { sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"

const FINALIZATION_IDLE_TIMEOUT_MS = 30_000

const advisoryLockKey = (projectId: string, lockKey: string) => `issues:discovery:${projectId}:${lockKey}`

export const IssueDiscoveryLockRepositoryLive = Layer.effect(
  IssueDiscoveryLockRepository,
  Effect.gen(function* () {
    return {
      withLock: (input, effect) =>
        Effect.gen(function* () {
          const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>

          return yield* sqlClient.transaction(
            Effect.gen(function* () {
              const transactionClient = (yield* SqlClient) as SqlClientShape<Operator>
              const lockKey = advisoryLockKey(input.projectId, input.lockKey)

              yield* transactionClient.query((db) =>
                db.execute(
                  sql`select set_config('idle_in_transaction_session_timeout', ${String(FINALIZATION_IDLE_TIMEOUT_MS)}, true)`,
                ),
              )
              yield* transactionClient
                .query((db) =>
                  db.execute<{ acquired: boolean }>(
                    sql`select pg_try_advisory_xact_lock(hashtextextended(${lockKey}, 0)) as acquired`,
                  ),
                )
                .pipe(
                  Effect.flatMap((result) => {
                    if (result.rows[0]?.acquired === true) return Effect.void

                    return Effect.fail(
                      new IssueDiscoveryLockUnavailableError({
                        projectId: input.projectId,
                        lockKey: input.lockKey,
                      }),
                    )
                  }),
                )

              return yield* effect
            }),
          )
        }),
    }
  }),
)
