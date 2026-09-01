import {
  type GithubSignalReference,
  GithubSignalReferenceRepository,
  githubSignalReferenceSchema,
} from "@domain/github"
import { OrganizationId, ProjectId, SqlClient, type SqlClientShape, toRepositoryError } from "@domain/shared"
import { and, desc, eq, inArray, or, type SQL, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator } from "../client.ts"
import { githubSignalReferences } from "../schema/github-signal-references.ts"

type Row = typeof githubSignalReferences.$inferSelect

const toDomain = (row: Row): GithubSignalReference =>
  githubSignalReferenceSchema.parse({
    id: row.id,
    organizationId: OrganizationId(row.organizationId),
    projectId: ProjectId(row.projectId),
    signalId: row.signalId,
    integrationId: row.integrationId,
    repoId: row.repoId,
    repoFullName: row.repoFullName,
    referenceType: row.referenceType,
    prNumber: row.prNumber,
    prState: row.prState,
    commitSha: row.commitSha,
    pushAfterSha: row.pushAfterSha,
    title: row.title,
    url: row.url,
    authorLogin: row.authorLogin,
    matchedSources: row.matchedSources ?? [],
    action: row.action,
    actionAppliedAt: row.actionAppliedAt,
    mergedAt: row.mergedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })

export const GithubSignalReferenceRepositoryLive = Layer.succeed(GithubSignalReferenceRepository, {
  upsert: (reference) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const conflict =
        reference.referenceType === "pull_request"
          ? {
              target: [
                githubSignalReferences.organizationId,
                githubSignalReferences.signalId,
                githubSignalReferences.repoId,
                githubSignalReferences.prNumber,
              ],
              targetWhere: sql`${githubSignalReferences.referenceType} = 'pull_request'`,
            }
          : {
              target: [
                githubSignalReferences.organizationId,
                githubSignalReferences.signalId,
                githubSignalReferences.repoId,
                githubSignalReferences.commitSha,
              ],
              targetWhere: sql`${githubSignalReferences.referenceType} = 'commit'`,
            }
      const [row] = yield* sqlClient
        .query((db, organizationId) =>
          db
            .insert(githubSignalReferences)
            .values({
              organizationId,
              projectId: reference.projectId,
              signalId: reference.signalId,
              integrationId: reference.integrationId,
              repoId: reference.repoId,
              repoFullName: reference.repoFullName,
              referenceType: reference.referenceType,
              prNumber: reference.prNumber,
              prState: reference.prState,
              commitSha: reference.commitSha,
              pushAfterSha: reference.pushAfterSha,
              title: reference.title,
              url: reference.url,
              authorLogin: reference.authorLogin,
              matchedSources: [...reference.matchedSources],
              action: reference.action,
              mergedAt: reference.mergedAt,
            })
            .onConflictDoUpdate({
              ...conflict,
              set: {
                repoFullName: reference.repoFullName,
                prState: reference.prState,
                pushAfterSha: reference.pushAfterSha,
                title: reference.title,
                url: reference.url,
                authorLogin: reference.authorLogin,
                matchedSources: [...reference.matchedSources],
                action: reference.action,
                actionAppliedAt: sql`CASE WHEN ${githubSignalReferences.action} IS DISTINCT FROM ${reference.action} THEN NULL ELSE ${githubSignalReferences.actionAppliedAt} END`,
                mergedAt: reference.mergedAt ?? sql`${githubSignalReferences.mergedAt}`,
                updatedAt: new Date(),
              },
            })
            .returning(),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "upsertGithubSignalReference")))
      return toDomain(row as Row)
    }),

  listByPr: (input) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select()
            .from(githubSignalReferences)
            .where(
              and(
                eq(githubSignalReferences.organizationId, organizationId),
                eq(githubSignalReferences.repoId, input.repoId),
                eq(githubSignalReferences.prNumber, input.prNumber),
                eq(githubSignalReferences.referenceType, "pull_request"),
                ...(input.projectId ? [eq(githubSignalReferences.projectId, input.projectId)] : []),
              ),
            ),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "listGithubReferencesByPr")))
      return rows.map(toDomain)
    }),

  listBySignal: (signalId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select()
            .from(githubSignalReferences)
            .where(
              and(
                eq(githubSignalReferences.organizationId, organizationId),
                eq(githubSignalReferences.signalId, signalId),
              ),
            )
            .orderBy(desc(githubSignalReferences.createdAt)),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "listGithubReferencesBySignal")))
      return rows.map(toDomain)
    }),

  findAbsorbableCommitReferences: (input) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const shaMatches: SQL[] = []
      const commitShas = [input.mergeCommitSha, input.headSha].filter((sha): sha is string => sha !== null)
      if (commitShas.length > 0) shaMatches.push(inArray(githubSignalReferences.commitSha, commitShas))
      if (input.mergeCommitSha !== null) shaMatches.push(eq(githubSignalReferences.pushAfterSha, input.mergeCommitSha))
      if (shaMatches.length === 0) return []
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select()
            .from(githubSignalReferences)
            .where(
              and(
                eq(githubSignalReferences.organizationId, organizationId),
                eq(githubSignalReferences.repoId, input.repoId),
                eq(githubSignalReferences.referenceType, "commit"),
                or(...shaMatches),
              ),
            ),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "findAbsorbableGithubCommitReferences")))
      return rows.map(toDomain)
    }),

  setPrState: (input) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      yield* sqlClient
        .query((db, organizationId) =>
          db
            .update(githubSignalReferences)
            .set({
              prState: input.prState,
              mergedAt: input.mergedAt ?? sql`${githubSignalReferences.mergedAt}`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(githubSignalReferences.organizationId, organizationId),
                eq(githubSignalReferences.repoId, input.repoId),
                eq(githubSignalReferences.prNumber, input.prNumber),
                eq(githubSignalReferences.referenceType, "pull_request"),
              ),
            ),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "setGithubPrState")))
    }),

  stampActionApplied: (input) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      yield* sqlClient
        .query((db, organizationId) =>
          db
            .update(githubSignalReferences)
            .set({ actionAppliedAt: input.appliedAt, updatedAt: new Date() })
            .where(
              and(eq(githubSignalReferences.organizationId, organizationId), eq(githubSignalReferences.id, input.id)),
            ),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "stampGithubActionApplied")))
    }),

  deleteById: (id) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      yield* sqlClient
        .query((db, organizationId) =>
          db
            .delete(githubSignalReferences)
            .where(and(eq(githubSignalReferences.organizationId, organizationId), eq(githubSignalReferences.id, id))),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "deleteGithubSignalReference")))
    }),

  deleteByProject: (projectId) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      yield* sqlClient
        .query((db, organizationId) =>
          db
            .delete(githubSignalReferences)
            .where(
              and(
                eq(githubSignalReferences.organizationId, organizationId),
                eq(githubSignalReferences.projectId, projectId),
              ),
            ),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "deleteGithubSignalReferencesByProject")))
    }),
})
