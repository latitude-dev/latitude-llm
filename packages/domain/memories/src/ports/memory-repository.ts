import type { ChSqlClient, OrganizationId, ProjectId, RepositoryError } from "@domain/shared"
import { Context, type Effect } from "effect"
import type { MemoryBlob } from "../entities/memory-blob.ts"
import type { MemoryCurrentEntry } from "../entities/memory-current.ts"
import type { MemoryEvent } from "../entities/memory-event.ts"
import type { MemoryRecordVersion, MemoryStoreWipe } from "../entities/memory-snapshot.ts"

/**
 * Repository port for the memory ledger (ClickHouse). The `ChSqlClient`
 * requirement is intentionally leaked (per-request org scope). Phase 1 exposes
 * the write side plus the reads reconstruction needs; blame / session-summary /
 * scope-listing reads grow the port in later phases.
 */
export interface MemoryRepositoryShape {
  insertEvents(events: readonly MemoryEvent[]): Effect.Effect<void, RepositoryError, ChSqlClient>
  upsertBlobs(blobs: readonly MemoryBlob[]): Effect.Effect<void, RepositoryError, ChSqlClient>
  upsertCurrent(entries: readonly MemoryCurrentEntry[]): Effect.Effect<void, RepositoryError, ChSqlClient>

  /** Latest mutating version per record from `memory_current`, `remove`s dropped (T = now). */
  readCurrentSnapshot(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly scope: string
  }): Effect.Effect<readonly MemoryRecordVersion[], RepositoryError, ChSqlClient>

  /** Latest mutating version per record from the ledger as of `at`, `remove`s dropped (T ≠ now). */
  readManifestAt(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly scope: string
    readonly at: Date
  }): Effect.Effect<readonly MemoryRecordVersion[], RepositoryError, ChSqlClient>

  /** Latest whole-store wipe `endTime` per store as of `at`, for the reconstruction post-filter (D9). */
  readLatestStoreWipes(input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly scope: string
    readonly at: Date
  }): Effect.Effect<readonly MemoryStoreWipe[], RepositoryError, ChSqlClient>
}

export class MemoryRepository extends Context.Service<MemoryRepository, MemoryRepositoryShape>()(
  "@domain/memories/MemoryRepository",
) {}
