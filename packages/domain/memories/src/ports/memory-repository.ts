import type {
  ChSqlClient,
  ExternalUserId,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SessionId,
  TraceId,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { MemoryBlob } from "../entities/memory-blob.ts"
import type { MemoryCurrentEntry } from "../entities/memory-current.ts"
import type { MemoryEvent } from "../entities/memory-event.ts"
import type { MemoryRecordVersion, MemoryStoreWipe } from "../entities/memory-snapshot.ts"
import type {
  MemoryStoreListOptions,
  MemoryStoreListPage,
  MemoryStoreUser,
  MemoryUserStore,
} from "../entities/memory-store.ts"

/**
 * Repository port for the memory ledger (ClickHouse). The `ChSqlClient`
 * requirement is intentionally leaked (per-request org scope). Covers writes,
 * current + point-in-time reconstruction, content-blob fetches, the session /
 * record-version reads the diff and summary computations consume, and the
 * store-listing / store-access reads the Memory page consumes. Blame reads grow
 * the port when that surface lands.
 */
export interface MemoryRepositoryShape {
  insertEvents(events: readonly MemoryEvent[]): Effect.Effect<void, RepositoryError, ChSqlClient>
  upsertBlobs(blobs: readonly MemoryBlob[]): Effect.Effect<void, RepositoryError, ChSqlClient>
  upsertCurrent(entries: readonly MemoryCurrentEntry[]): Effect.Effect<void, RepositoryError, ChSqlClient>

  /** Latest mutating version per record of one store from `memory_current`, `remove`s dropped (T = now). */
  readCurrentSnapshot(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly storeId: string
  }): Effect.Effect<readonly MemoryRecordVersion[], RepositoryError, ChSqlClient>

  /** Latest mutating version per record of one store from the ledger as of `at`, `remove`s dropped (T ≠ now). */
  readManifestAt(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly storeId: string
    readonly at: Date
  }): Effect.Effect<readonly MemoryRecordVersion[], RepositoryError, ChSqlClient>

  /** Latest whole-store wipe `endTime` for one store as of `at`, for the reconstruction post-filter (D9). */
  readLatestStoreWipes(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly storeId: string
    readonly at: Date
  }): Effect.Effect<readonly MemoryStoreWipe[], RepositoryError, ChSqlClient>

  /** Content bodies for the given hashes (per-org, dedup-collapsed). Empty hashes are ignored. */
  readBlobs(input: {
    readonly organizationId: OrganizationId
    readonly hashes: readonly string[]
  }): Effect.Effect<readonly MemoryBlob[], RepositoryError, ChSqlClient>

  /** All ledger events for a session (optionally one trace), deduped, ordered by `endTime`. */
  readSessionMemoryEvents(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly sessionId: SessionId
    readonly traceId?: TraceId
  }): Effect.Effect<readonly MemoryEvent[], RepositoryError, ChSqlClient>

  /** Mutating version chains for a set of records, deduped, per record ordered by `endTime`. */
  readRecordVersions(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly records: readonly { readonly storeId: string; readonly recordId: string }[]
    readonly at?: Date
  }): Effect.Effect<readonly MemoryRecordVersion[], RepositoryError, ChSqlClient>

  /**
   * One roll-up row per store (stores with ≥1 live record in `memory_current`),
   * with `memory_events` session/user/last-read stats left-joined. Server-side
   * sort + limit/offset pagination.
   */
  listStores(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly options?: MemoryStoreListOptions
  }): Effect.Effect<MemoryStoreListPage, RepositoryError, ChSqlClient>

  /** Distinct users who touched one store (reads count as access), newest-first. */
  listStoreUsers(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly storeId: string
  }): Effect.Effect<readonly MemoryStoreUser[], RepositoryError, ChSqlClient>

  /** Distinct stores one user touched (reads count as access), newest-first. */
  listUserStores(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly userId: ExternalUserId
  }): Effect.Effect<readonly MemoryUserStore[], RepositoryError, ChSqlClient>
}

export class MemoryRepository extends Context.Service<MemoryRepository, MemoryRepositoryShape>()(
  "@domain/memories/MemoryRepository",
) {}
