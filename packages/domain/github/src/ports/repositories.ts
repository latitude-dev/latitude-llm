import type { OrganizationId, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { GithubDelivery, GithubDeliveryStatus } from "../entities/github-delivery.ts"
import type { GithubAccountType, GithubIntegration, GithubRepositorySelection } from "../entities/github-integration.ts"
import type { GithubSignalReference } from "../entities/github-signal-reference.ts"
import type { GithubSyncConfigRow } from "../entities/github-sync-config.ts"
import type { GithubIntegrationConflictError } from "../errors.ts"
import type { GithubMatchAction, GithubTextSource } from "../matching/types.ts"

export interface GithubIntegrationRepositoryShape {
  /** The live install (`revoked_at IS NULL`) for the RLS-scoped org, or null. */
  readonly findActiveByOrganizationId: () => Effect.Effect<GithubIntegration | null, RepositoryError, SqlClient>
  /**
   * Inserts the integration (`integrations` parent + `github_integration_details`
   * child). The `(kind, vendor_account_id) WHERE revoked_at IS NULL` partial
   * unique surfaces a {@link GithubIntegrationConflictError} when another org
   * already claims the installation. The caller owns the transaction.
   */
  readonly save: (
    integration: GithubIntegration,
  ) => Effect.Effect<GithubIntegration, RepositoryError | GithubIntegrationConflictError, SqlClient>
  /** Stamps `revoked_at` on the active row, guarded by `revoked_at IS NULL`. Returns whether this call won the claim. */
  readonly softRevokeById: (id: string, revokedAt: Date) => Effect.Effect<boolean, RepositoryError, SqlClient>
  /** Toggles `suspended_at` on the details row. Returns whether a row changed. */
  readonly setSuspendedById: (
    id: string,
    suspendedAt: Date | null,
  ) => Effect.Effect<boolean, RepositoryError, SqlClient>
  /** Refreshes cached installation metadata (account + repo selection) on the details row. Returns whether a row changed. */
  readonly updateMetadataById: (input: {
    readonly id: string
    readonly accountLogin: string
    readonly accountType: GithubAccountType
    readonly repositorySelection: GithubRepositorySelection
  }) => Effect.Effect<boolean, RepositoryError, SqlClient>
}

export class GithubIntegrationRepository extends Context.Service<
  GithubIntegrationRepository,
  GithubIntegrationRepositoryShape
>()("@domain/github/GithubIntegrationRepository") {}

export interface GithubSyncConfigRepositoryShape {
  /** Inserts a config row (org-default at claim time, or a project repo binding). */
  readonly create: (row: GithubSyncConfigRow) => Effect.Effect<GithubSyncConfigRow, RepositoryError, SqlClient>
  /** Inserts or updates a row by primary key (settings edits). */
  readonly upsert: (row: GithubSyncConfigRow) => Effect.Effect<GithubSyncConfigRow, RepositoryError, SqlClient>
  /** A row by id in the RLS-scoped org, or null. */
  readonly findById: (id: string) => Effect.Effect<GithubSyncConfigRow | null, RepositoryError, SqlClient>
  /** The org-default row (`project_id IS NULL`) for an integration, or null. */
  readonly findDefaultByIntegration: (
    integrationId: string,
  ) => Effect.Effect<GithubSyncConfigRow | null, RepositoryError, SqlClient>
  /** A project's override row for an integration (`project_id = projectId`), or null — the upsert target and settings read. */
  readonly findByProject: (
    integrationId: string,
    projectId: string,
  ) => Effect.Effect<GithubSyncConfigRow | null, RepositoryError, SqlClient>
  /** Enabled project override rows (`project_id IS NOT NULL`) bound to a repo for an integration in the RLS-scoped org — webhook routing. */
  readonly listByOrganizationRepo: (
    integrationId: string,
    repoId: number,
  ) => Effect.Effect<readonly GithubSyncConfigRow[], RepositoryError, SqlClient>
  /** Every project override row for an integration (any repo, enabled or not) — used to exclude non-inheriting projects (D16). */
  readonly listProjectConfigs: (
    integrationId: string,
  ) => Effect.Effect<readonly GithubSyncConfigRow[], RepositoryError, SqlClient>
  /** Deletes every project override row for a project across all integrations (the org-default row is never touched) — reset and ProjectDeleted cascade. */
  readonly deleteByProject: (projectId: string) => Effect.Effect<void, RepositoryError, SqlClient>
}

export class GithubSyncConfigRepository extends Context.Service<
  GithubSyncConfigRepository,
  GithubSyncConfigRepositoryShape
>()("@domain/github/GithubSyncConfigRepository") {}

export interface GithubDeliveryClaimInput {
  readonly deliveryId: string
  readonly integrationId: string
  readonly event: string
  readonly action: string | null
  readonly repoId: number | null
}

export interface GithubDeliveryFinalizeInput {
  readonly id: string
  readonly status: GithubDeliveryStatus
  readonly skipReason?: string | null
  readonly errorCategory?: string | null
  readonly errorDetail?: string | null
  readonly truncated?: boolean
  readonly prNumber?: number | null
  readonly mergeCommitSha?: string | null
  readonly headSha?: string | null
}

export interface GithubDeliveryRepositoryShape {
  /**
   * Claims a delivery for processing. Inserts the ledger row, or re-claims an
   * existing row whose `status` is still null (a prior attempt crashed before
   * finalizing). Returns `claimed: false` when a finalized row already exists —
   * the redelivery is a no-op the caller acks.
   */
  readonly claim: (
    input: GithubDeliveryClaimInput,
  ) => Effect.Effect<{ readonly claimed: boolean; readonly id: string | null }, RepositoryError, SqlClient>
  /** Records the terminal outcome (status + reasons + attribution keys) and stamps `processed_at`. */
  readonly finalize: (input: GithubDeliveryFinalizeInput) => Effect.Effect<void, RepositoryError, SqlClient>
  /**
   * Recent deliveries for the RLS-scoped org, newest first — the settings debug table.
   * Keyset-paginated on `(received_at, id)`: pass the last row of the previous page as
   * `before` to fetch older rows. `limit` bounds the page (over-fetch by one to detect more).
   */
  readonly listRecentByOrganization: (input: {
    readonly limit: number
    readonly before?: { readonly receivedAt: Date; readonly id: string }
  }) => Effect.Effect<readonly GithubDelivery[], RepositoryError, SqlClient>
  /**
   * Push↔PR attribution lookup (5.9): the most recent processed merged-PR
   * delivery on this repo whose stamped `mergeCommitSha` or `headSha` is one of
   * the given shas (the push `after` + its commit ids). Null when the push is
   * not a PR merge.
   */
  readonly findMergeByShas: (input: {
    readonly repoId: number
    readonly shas: readonly string[]
  }) => Effect.Effect<GithubMergeAttribution | null, RepositoryError, SqlClient>
}

export interface GithubMergeAttribution {
  readonly deliveryId: string
  readonly prNumber: number
  readonly mergeCommitSha: string | null
  readonly headSha: string | null
}

export class GithubDeliveryRepository extends Context.Service<
  GithubDeliveryRepository,
  GithubDeliveryRepositoryShape
>()("@domain/github/GithubDeliveryRepository") {}

/** The natural-key attributes of a signal reference, used to upsert by the per-type partial unique. */
export interface GithubSignalReferenceUpsert {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly signalId: string
  readonly integrationId: string
  readonly repoId: number
  readonly repoFullName: string
  readonly referenceType: GithubSignalReference["referenceType"]
  readonly prNumber: number | null
  readonly prState: GithubSignalReference["prState"]
  readonly commitSha: string | null
  readonly pushAfterSha: string | null
  readonly title: string
  readonly url: string
  readonly authorLogin: string | null
  readonly matchedSources: readonly GithubTextSource[]
  readonly action: GithubMatchAction
  readonly mergedAt: Date | null
}

export interface GithubSignalReferenceRepositoryShape {
  /**
   * Upserts a reference by its per-type natural key (`(org, signal, repo, pr_number)`
   * for PRs, `(org, signal, repo, commit_sha)` for commits). Refreshes the
   * mutable label/state/action/sources; never clears an already-stamped
   * `merged_at` or `action_applied_at` (those are owned by
   * {@link setPrState}/{@link stampActionApplied}). Returns the stored row.
   */
  readonly upsert: (
    reference: GithubSignalReferenceUpsert,
  ) => Effect.Effect<GithubSignalReference, RepositoryError, SqlClient>
  /** References for a PR in the RLS-scoped org; narrow to a project when reconciling that project's set (5.8 `edited`). */
  readonly listByPr: (input: {
    readonly repoId: number
    readonly prNumber: number
    readonly projectId?: ProjectId
  }) => Effect.Effect<readonly GithubSignalReference[], RepositoryError, SqlClient>
  /** All references for a signal, newest first — the detail-page read (5.11). */
  readonly listBySignal: (
    signalId: string,
  ) => Effect.Effect<readonly GithubSignalReference[], RepositoryError, SqlClient>
  /**
   * Commit references a PR merge explains (5.9 absorb): `commit_sha ∈ {mergeCommitSha,
   * headSha}` OR `push_after_sha == mergeCommitSha` (the last clause catches every
   * intermediate commit of a rebase merge). Scoped to the repo in the RLS org.
   */
  readonly findAbsorbableCommitReferences: (input: {
    readonly repoId: number
    readonly mergeCommitSha: string | null
    readonly headSha: string | null
  }) => Effect.Effect<readonly GithubSignalReference[], RepositoryError, SqlClient>
  /** Sets `pr_state` (and, when merging, `merged_at`) on every reference of a PR. */
  readonly setPrState: (input: {
    readonly repoId: number
    readonly prNumber: number
    readonly prState: GithubSignalReference["prState"]
    readonly mergedAt?: Date | null
  }) => Effect.Effect<void, RepositoryError, SqlClient>
  /** Stamps `action_applied_at` after a lifecycle command ran for this reference (idempotent provenance). */
  readonly stampActionApplied: (input: {
    readonly id: string
    readonly appliedAt: Date
  }) => Effect.Effect<void, RepositoryError, SqlClient>
  /** Deletes a reference by id (pre-merge recompute removals only; applied references are never deleted — D8). */
  readonly deleteById: (id: string) => Effect.Effect<void, RepositoryError, SqlClient>
  /** Deletes every reference of a project (the `ProjectDeleted` cascade, P3-7). */
  readonly deleteByProject: (projectId: ProjectId) => Effect.Effect<void, RepositoryError, SqlClient>
}

export class GithubSignalReferenceRepository extends Context.Service<
  GithubSignalReferenceRepository,
  GithubSignalReferenceRepositoryShape
>()("@domain/github/GithubSignalReferenceRepository") {}
