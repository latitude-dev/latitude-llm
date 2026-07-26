import {
  GITHUB_INTEGRATION_KIND,
  type GithubIntegration,
  GithubIntegrationConflictError,
  GithubIntegrationRepository,
  githubIntegrationSchema,
} from "@domain/github"
import {
  findPostgresUniqueViolationConstraint,
  OrganizationId,
  type OrganizationId as OrganizationIdType,
  type RepositoryError,
  SqlClient,
  type SqlClientShape,
  toRepositoryError,
  UserId,
} from "@domain/shared"
import { and, eq, isNull } from "drizzle-orm"
import { Effect, Layer } from "effect"
import type { Operator, PostgresDb } from "../client.ts"
import { githubIntegrationDetails } from "../schema/github-integration-details.ts"
import { integrations } from "../schema/integrations.ts"

/** Must match the partial unique index name in `schema/integrations.ts`. */
const VENDOR_ACCOUNT_UNIQUE_INDEX = "integrations_active_kind_vendor_account_idx"

type IntegrationRow = typeof integrations.$inferSelect
type GithubDetailsRow = typeof githubIntegrationDetails.$inferSelect

const toDomainGithubIntegration = (parent: IntegrationRow, details: GithubDetailsRow): GithubIntegration =>
  githubIntegrationSchema.parse({
    id: parent.id,
    organizationId: OrganizationId(parent.organizationId),
    installationId: details.installationId,
    accountLogin: details.accountLogin,
    accountType: details.accountType,
    repositorySelection: details.repositorySelection,
    suspendedAt: details.suspendedAt,
    installedByUserId: UserId(parent.installedByUserId),
    installedAt: parent.installedAt,
    revokedAt: parent.revokedAt,
    createdAt: parent.createdAt,
    updatedAt: parent.updatedAt,
  })

const buildInsertRows = (integration: GithubIntegration, organizationId: string) => {
  const parentRow = {
    id: integration.id,
    organizationId,
    kind: GITHUB_INTEGRATION_KIND,
    vendorAccountId: String(integration.installationId),
    installedByUserId: integration.installedByUserId,
    installedAt: integration.installedAt,
    revokedAt: integration.revokedAt,
  }
  const detailsRow = {
    integrationId: integration.id,
    organizationId,
    installationId: integration.installationId,
    accountLogin: integration.accountLogin,
    accountType: integration.accountType,
    repositorySelection: integration.repositorySelection,
    suspendedAt: integration.suspendedAt,
  }
  return { parentRow, detailsRow } as const
}

const mapInstallationConflict = (
  error: RepositoryError,
  installationId: number,
): Effect.Effect<never, RepositoryError | GithubIntegrationConflictError> => {
  const constraint = findPostgresUniqueViolationConstraint(error.cause)
  if (constraint === VENDOR_ACCOUNT_UNIQUE_INDEX) {
    return Effect.fail(new GithubIntegrationConflictError({ installationId }))
  }
  return Effect.fail(error)
}

export const GithubIntegrationRepositoryLive = Layer.succeed(GithubIntegrationRepository, {
  findActiveByOrganizationId: () =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const [row] = yield* sqlClient
        .query((db, organizationId) =>
          db
            .select({ parent: integrations, details: githubIntegrationDetails })
            .from(integrations)
            .innerJoin(githubIntegrationDetails, eq(githubIntegrationDetails.integrationId, integrations.id))
            .where(
              and(
                eq(integrations.organizationId, organizationId),
                eq(integrations.kind, GITHUB_INTEGRATION_KIND),
                isNull(integrations.revokedAt),
              ),
            )
            .limit(1),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "findActiveGithubIntegrationByOrganizationId")))
      if (!row) return null
      return toDomainGithubIntegration(row.parent, row.details)
    }),

  save: (integration) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const { parentRow, detailsRow } = buildInsertRows(integration, sqlClient.organizationId)

      // Two-row insert. Atomicity comes from the caller wrapping the call in
      // `sqlClient.transaction(...)` (see `claimGithubInstallationUseCase`).
      // The repo intentionally does not open its own transaction here: that
      // would leak `ConcurrentSqlTransactionError` into the port, and the
      // codebase convention is for use cases to own transaction boundaries.
      yield* sqlClient
        .query((db) => db.insert(integrations).values(parentRow))
        .pipe(
          Effect.mapError((e) => toRepositoryError(e, "saveGithubIntegration")),
          Effect.catchTag("RepositoryError", (error) => mapInstallationConflict(error, integration.installationId)),
        )
      yield* sqlClient
        .query((db) => db.insert(githubIntegrationDetails).values(detailsRow))
        .pipe(Effect.mapError((e) => toRepositoryError(e, "saveGithubIntegrationDetails")))
      return integration
    }),

  softRevokeById: (id, revokedAt) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .update(integrations)
            .set({ revokedAt, updatedAt: new Date() })
            .where(
              and(
                eq(integrations.id, id),
                eq(integrations.organizationId, organizationId),
                eq(integrations.kind, GITHUB_INTEGRATION_KIND),
                isNull(integrations.revokedAt),
              ),
            )
            .returning({ id: integrations.id }),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "softRevokeGithubIntegration")))
      return rows.length > 0
    }),

  setSuspendedById: (id, suspendedAt) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .update(githubIntegrationDetails)
            .set({ suspendedAt, updatedAt: new Date() })
            .where(
              and(
                eq(githubIntegrationDetails.integrationId, id),
                eq(githubIntegrationDetails.organizationId, organizationId),
              ),
            )
            .returning({ id: githubIntegrationDetails.integrationId }),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "setGithubIntegrationSuspended")))
      return rows.length > 0
    }),

  updateMetadataById: ({ id, accountLogin, accountType, repositorySelection }) =>
    Effect.gen(function* () {
      const sqlClient = (yield* SqlClient) as SqlClientShape<Operator>
      const rows = yield* sqlClient
        .query((db, organizationId) =>
          db
            .update(githubIntegrationDetails)
            .set({ accountLogin, accountType, repositorySelection, updatedAt: new Date() })
            .where(
              and(
                eq(githubIntegrationDetails.integrationId, id),
                eq(githubIntegrationDetails.organizationId, organizationId),
              ),
            )
            .returning({ id: githubIntegrationDetails.integrationId }),
        )
        .pipe(Effect.mapError((e) => toRepositoryError(e, "updateGithubIntegrationMetadata")))
      return rows.length > 0
    }),
})

/**
 * Cross-organization lookup for the webhook worker: resolves an installation id
 * to its claimed integration before the org is known. Bypasses per-org RLS by
 * not filtering on `organization_id`, so the caller must use an admin client.
 */
export const findActiveGithubInstallationAcrossOrgs = (
  db: PostgresDb,
  installationId: number,
): Effect.Effect<{ readonly id: string; readonly organizationId: OrganizationIdType } | null, RepositoryError> =>
  Effect.tryPromise({
    try: async () => {
      const rows = await db
        .select({ id: integrations.id, organizationId: integrations.organizationId })
        .from(integrations)
        .where(
          and(
            eq(integrations.kind, GITHUB_INTEGRATION_KIND),
            eq(integrations.vendorAccountId, String(installationId)),
            isNull(integrations.revokedAt),
          ),
        )
        .limit(1)
      const row = rows[0]
      if (!row) return null
      return { id: row.id, organizationId: OrganizationId(row.organizationId) }
    },
    catch: (cause) => toRepositoryError(cause, "findActiveGithubInstallationAcrossOrgs"),
  })
