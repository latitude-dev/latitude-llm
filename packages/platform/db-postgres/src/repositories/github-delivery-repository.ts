import { type GithubDelivery, GithubDeliveryRepository, githubDeliverySchema } from "@domain/github"
import { OrganizationId, SqlClient, type SqlClientShape, toRepositoryError } from "@domain/shared"
import { and, desc, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { githubDeliveries } from "../schema/github-deliveries.ts"

type Row = typeof githubDeliveries.$inferSelect

const toDomain = (row: Row): GithubDelivery =>
  githubDeliverySchema.parse({
    id: row.id,
    organizationId: OrganizationId(row.organizationId),
    integrationId: row.integrationId,
    deliveryId: row.deliveryId,
    event: row.event,
    action: row.action,
    repoId: row.repoId,
    status: row.status,
    skipReason: row.skipReason,
    errorCategory: row.errorCategory,
    errorDetail: row.errorDetail,
    truncated: row.truncated,
    prNumber: row.prNumber,
    mergeCommitSha: row.mergeCommitSha,
    headSha: row.headSha,
    receivedAt: row.receivedAt,
    processedAt: row.processedAt,
  })

export const GithubDeliveryRepositoryLive = Layer.succeed(GithubDeliveryRepository, {
  claim: (input) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const now = new Date()
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .insert(githubDeliveries)
            .values({
              organizationId,
              integrationId: input.integrationId,
              deliveryId: input.deliveryId,
              event: input.event,
              action: input.action,
              repoId: input.repoId,
              receivedAt: now,
            })
            .onConflictDoUpdate({
              target: githubDeliveries.deliveryId,
              set: { receivedAt: now },
              setWhere: isNull(githubDeliveries.status),
            })
            .returning({ id: githubDeliveries.id }),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "claimGithubDelivery")))
      const claimedId = rows[0]?.id ?? null
      return { claimed: claimedId !== null, id: claimedId }
    }),

  finalize: (input) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      yield* sqlClient
        .query((db, organizationId) =>
          db
            .update(githubDeliveries)
            .set({
              status: input.status,
              skipReason: input.skipReason ?? null,
              errorCategory: input.errorCategory ?? null,
              errorDetail: input.errorDetail ?? null,
              truncated: input.truncated ?? false,
              prNumber: input.prNumber ?? null,
              mergeCommitSha: input.mergeCommitSha ?? null,
              headSha: input.headSha ?? null,
              processedAt: new Date(),
            })
            .where(and(eq(githubDeliveries.id, input.id), eq(githubDeliveries.organizationId, organizationId))),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "finalizeGithubDelivery")))
    }),

  listRecentByOrganization: ({ limit, before }) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      // Keyset on (received_at, id): the id tie-breaker keeps the order total when
      // deliveries share a received_at, so a page boundary never skips or repeats a
      // sibling. ORDER BY and the cursor predicate must match.
      const keyset = before
        ? or(
            lt(githubDeliveries.receivedAt, before.receivedAt),
            and(eq(githubDeliveries.receivedAt, before.receivedAt), lt(githubDeliveries.id, before.id)),
          )
        : undefined
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select()
            .from(githubDeliveries)
            .where(and(eq(githubDeliveries.organizationId, organizationId), ...(keyset ? [keyset] : [])))
            .orderBy(desc(githubDeliveries.receivedAt), desc(githubDeliveries.id))
            .limit(limit),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "listRecentGithubDeliveries")))
      return rows.map(toDomain)
    }),

  findMergeByShas: (input) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const shas = [...input.shas]
      if (shas.length === 0) return null
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select({
              deliveryId: githubDeliveries.deliveryId,
              prNumber: githubDeliveries.prNumber,
              mergeCommitSha: githubDeliveries.mergeCommitSha,
              headSha: githubDeliveries.headSha,
            })
            .from(githubDeliveries)
            .where(
              and(
                eq(githubDeliveries.organizationId, organizationId),
                eq(githubDeliveries.repoId, input.repoId),
                isNotNull(githubDeliveries.prNumber),
                or(inArray(githubDeliveries.mergeCommitSha, shas), inArray(githubDeliveries.headSha, shas)),
              ),
            )
            .orderBy(desc(githubDeliveries.processedAt))
            .limit(1),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "findGithubMergeByShas")))
      const row = rows[0]
      if (!row || row.prNumber === null) return null
      return {
        deliveryId: row.deliveryId,
        prNumber: row.prNumber,
        mergeCommitSha: row.mergeCommitSha,
        headSha: row.headSha,
      }
    }),
})
