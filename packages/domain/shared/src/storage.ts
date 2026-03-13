import { Data, Effect } from "effect"
import type { OrganizationId, ProjectId } from "./id.ts"

export interface StorageDiskPort {
  put(key: string, contents: string | Uint8Array): Promise<void>
  get(key: string): Promise<string>
  delete(key: string): Promise<void>
}

export class StorageError extends Data.TaggedError("StorageError")<{
  readonly cause: unknown
  readonly operation: string
}> {
  readonly httpStatus = 500
  readonly httpMessage = "Storage operation failed"
}

type FolderNamespace = "datasets" | "ingest" | "unknown"

type BaseStorageOptions = {
  readonly organizationId: OrganizationId
  readonly content: string | Uint8Array
  readonly extension?: string
}

type DatasetStorageOptions = BaseStorageOptions & {
  readonly namespace: "datasets"
  readonly projectId: ProjectId
}

type IngestStorageOptions = BaseStorageOptions & {
  readonly namespace: "ingest"
  readonly projectId: ProjectId
}

type PutInDiskOptions<N extends FolderNamespace> = N extends "datasets"
  ? DatasetStorageOptions
  : N extends "ingest"
    ? IngestStorageOptions
    : { readonly namespace: "unknown" } & BaseStorageOptions

const projectsPath = (base: string, projectId: ProjectId) => `${base}/projects/${projectId}`

function buildStorageKey<N extends FolderNamespace>(options: PutInDiskOptions<N>): string | undefined {
  const basePath = `organizations/${options.organizationId}`

  switch (options.namespace) {
    case "datasets": {
      const id = crypto.randomUUID()
      const ext = options.extension ?? "csv"
      return `${projectsPath(basePath, options.projectId)}/datasets/${id}.${ext}`
    }
    case "ingest": {
      const id = crypto.randomUUID()
      const ext = options.extension ?? "json"
      return `${projectsPath(basePath, options.projectId)}/ingest/${id}.${ext}`
    }
    default:
      return undefined
  }
}

/**
 * Single entry point for writing to object storage. Enforces a consistent
 * key layout — `organizations/{orgId}/{namespace}/...` — so callers never
 * build ad-hoc paths and every namespace documents its own sub-structure
 * in one place (`buildStorageKey`). Returns the generated fileKey.
 */
export function putInDisk<N extends FolderNamespace>(
  disk: StorageDiskPort,
  options: PutInDiskOptions<N>,
): Effect.Effect<string, StorageError> {
  return Effect.tryPromise({
    try: async () => {
      const fileKey = buildStorageKey(options)
      if (!fileKey) throw new Error(`Unknown storage namespace: ${options.namespace}`)

      await disk.put(fileKey, options.content)
      return fileKey
    },
    catch: (cause) => new StorageError({ cause, operation: "putInDisk" }),
  })
}
