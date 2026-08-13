import { GithubSyncConfigRepository, type GithubSyncConfigRow, githubSyncConfigRowSchema } from "@domain/github"
import { OrganizationId, ProjectId, SqlClient, type SqlClientShape, toRepositoryError } from "@domain/shared"
import { and, eq, isNotNull, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { githubSyncConfigs } from "../schema/github-sync-configs.ts"

type Row = typeof githubSyncConfigs.$inferSelect

const toDomain = (row: Row): GithubSyncConfigRow =>
  githubSyncConfigRowSchema.parse({
    id: row.id,
    organizationId: OrganizationId(row.organizationId),
    projectId: row.projectId === null ? null : ProjectId(row.projectId),
    integrationId: row.integrationId,
    repoId: row.repoId,
    repoFullName: row.repoFullName,
    branch: row.branch,
    enabled: row.enabled,
    monitorPullRequests: row.monitorPullRequests,
    monitorCommits: row.monitorCommits,
    sources: row.sources,
    rules: row.rules,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

const toInsertRow = (config: GithubSyncConfigRow, organizationId: string) => ({
  id: config.id,
  organizationId,
  projectId: config.projectId,
  integrationId: config.integrationId,
  repoId: config.repoId,
  repoFullName: config.repoFullName,
  branch: config.branch,
  enabled: config.enabled,
  monitorPullRequests: config.monitorPullRequests,
  monitorCommits: config.monitorCommits,
  sources: config.sources,
  rules: config.rules,
})

export const GithubSyncConfigRepositoryLive = Layer.succeed(GithubSyncConfigRepository, {
  create: (config) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const [row] = yield* sqlClient
        .query((db, organizationId) =>
          db.insert(githubSyncConfigs).values(toInsertRow(config, organizationId)).returning(),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "createGithubSyncConfig")))
      return toDomain(row as Row)
    }),

  upsert: (config) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const [row] = yield* sqlClient
        .query((db, organizationId) =>
          db
            .insert(githubSyncConfigs)
            .values(toInsertRow(config, organizationId))
            .onConflictDoUpdate({
              target: githubSyncConfigs.id,
              set: {
                repoId: config.repoId,
                repoFullName: config.repoFullName,
                branch: config.branch,
                enabled: config.enabled,
                monitorPullRequests: config.monitorPullRequests,
                monitorCommits: config.monitorCommits,
                sources: config.sources,
                rules: config.rules,
                updatedAt: new Date(),
              },
            })
            .returning(),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "upsertGithubSyncConfig")))
      return toDomain(row as Row)
    }),

  findById: (id) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const [row] = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select()
            .from(githubSyncConfigs)
            .where(and(eq(githubSyncConfigs.organizationId, organizationId), eq(githubSyncConfigs.id, id)))
            .limit(1),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "findGithubSyncConfigById")))
      return row ? toDomain(row) : null
    }),

  findDefaultByIntegration: (integrationId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const [row] = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select()
            .from(githubSyncConfigs)
            .where(
              and(
                eq(githubSyncConfigs.organizationId, organizationId),
                eq(githubSyncConfigs.integrationId, integrationId),
                isNull(githubSyncConfigs.projectId),
              ),
            )
            .limit(1),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "findDefaultGithubSyncConfig")))
      return row ? toDomain(row) : null
    }),

  findByProject: (integrationId, projectId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const [row] = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select()
            .from(githubSyncConfigs)
            .where(
              and(
                eq(githubSyncConfigs.organizationId, organizationId),
                eq(githubSyncConfigs.integrationId, integrationId),
                eq(githubSyncConfigs.projectId, projectId),
              ),
            )
            .limit(1),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "findGithubSyncConfigByProject")))
      return row ? toDomain(row) : null
    }),

  listByOrganizationRepo: (integrationId, repoId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select()
            .from(githubSyncConfigs)
            .where(
              and(
                eq(githubSyncConfigs.organizationId, organizationId),
                eq(githubSyncConfigs.integrationId, integrationId),
                eq(githubSyncConfigs.repoId, repoId),
                isNotNull(githubSyncConfigs.projectId),
                eq(githubSyncConfigs.enabled, true),
              ),
            ),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "listGithubSyncConfigsByRepo")))
      return rows.map(toDomain)
    }),

  listProjectConfigs: (integrationId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select()
            .from(githubSyncConfigs)
            .where(
              and(
                eq(githubSyncConfigs.organizationId, organizationId),
                eq(githubSyncConfigs.integrationId, integrationId),
                isNotNull(githubSyncConfigs.projectId),
              ),
            ),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "listGithubProjectConfigs")))
      return rows.map(toDomain)
    }),

  deleteByProject: (projectId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      yield* sqlClient
        .query((db, organizationId) =>
          db
            .delete(githubSyncConfigs)
            .where(
              and(eq(githubSyncConfigs.organizationId, organizationId), eq(githubSyncConfigs.projectId, projectId)),
            ),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "deleteGithubSyncConfigsByProject")))
    }),
})
