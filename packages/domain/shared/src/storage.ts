import { Effect, Context } from "effect"
import { StorageError } from "./errors.ts"
import type { DatasetId, OrganizationId, ProjectId } from "./id.ts"

export { StorageError }

export interface StorageDiskPort {
  put(key: string, contents: string | Uint8Array): Promise<void>
  putStream(key: string, contents: ReadableStream<Uint8Array>): Promise<void>
  get(key: string): Promise<string>
  getBytes(key: string): Promise<Uint8Array>
  getStream(key: string): Promise<ReadableStream<Uint8Array>>
  delete(key: string): Promise<void>
  getSignedUrl(key: string, options?: { expiresIn?: number }): Promise<string>
}

export class StorageDisk extends Context.Service<StorageDisk, StorageDiskPort>()("@domain/shared/StorageDisk") {}

type FolderNamespace = "datasetExports" | "datasets" | "exports" | "ingest" | "unknown"

type BaseStorageOptions = {
  readonly organizationId: OrganizationId
  readonly content: string | Uint8Array
  readonly extension?: string
}

type BaseStreamStorageOptions = {
  readonly organizationId: OrganizationId
  readonly stream: ReadableStream<Uint8Array>
  readonly extension?: string
}

type DatasetExportsStorageOptions = BaseStorageOptions & {
  readonly namespace: "datasetExports"
  readonly projectId: ProjectId
  readonly datasetId: DatasetId
}

type DatasetStorageOptions = BaseStorageOptions & {
  readonly namespace: "datasets"
  readonly projectId: ProjectId
}

type IngestStorageOptions = BaseStorageOptions & {
  readonly namespace: "ingest"
  readonly projectId: ProjectId
}

type ExportsStorageOptions = BaseStorageOptions & {
  readonly namespace: "exports"
  readonly projectId: ProjectId
  readonly filename: string
}

type DatasetExportsStreamOptions = BaseStreamStorageOptions & {
  readonly namespace: "datasetExports"
  readonly projectId: ProjectId
  readonly datasetId: DatasetId
}

type DatasetsStreamOptions = BaseStreamStorageOptions & {
  readonly namespace: "datasets"
  readonly projectId: ProjectId
}

type IngestStreamOptions = BaseStreamStorageOptions & {
  readonly namespace: "ingest"
  readonly projectId: ProjectId
}

type ExportsStreamOptions = BaseStreamStorageOptions & {
  readonly namespace: "exports"
  readonly projectId: ProjectId
  readonly filename: string
}

type PutInDiskStreamOptions<N extends FolderNamespace> = N extends "datasetExports"
  ? DatasetExportsStreamOptions
  : N extends "datasets"
    ? DatasetsStreamOptions
    : N extends "exports"
      ? ExportsStreamOptions
      : N extends "ingest"
        ? IngestStreamOptions
        : never

type PutInDiskOptions<N extends FolderNamespace> = N extends "datasetExports"
  ? DatasetExportsStorageOptions
  : N extends "datasets"
    ? DatasetStorageOptions
    : N extends "exports"
      ? ExportsStorageOptions
      : N extends "ingest"
        ? IngestStorageOptions
        : { readonly namespace: "unknown" } & BaseStorageOptions

const projectsPath = (base: string, projectId: ProjectId) => `${base}/projects/${projectId}`

type KeyBuildingOptions = PutInDiskOptions<FolderNamespace> | PutInDiskStreamOptions<FolderNamespace>

function buildStorageKey(options: KeyBuildingOptions): string | undefined {
  const basePath = `organizations/${options.organizationId}`

  switch (options.namespace) {
    case "datasetExports": {
      const exportId = crypto.randomUUID()
      const ext = options.extension ?? "csv"
      return `${projectsPath(basePath, options.projectId)}/dataset-exports/${options.datasetId}/${exportId}.${ext}`
    }
    case "datasets": {
      const id = crypto.randomUUID()
      const ext = options.extension ?? "csv"
      return `${projectsPath(basePath, options.projectId)}/datasets/${id}.${ext}`
    }
    case "exports": {
      const exportId = crypto.randomUUID()
      // For exports, use the provided filename which already includes the extension
      return `${projectsPath(basePath, options.projectId)}/exports/${exportId}/${options.filename}`
    }
    case "ingest": {
      const id = crypto.randomUUID()
      const ext = options.extension ?? "json"
      return `tmp-ingest/${options.organizationId}/${options.projectId}/${id}.${ext}`
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

/**
 * Writes to object storage from a ReadableStream (Web Standard Streams API).
 * Same key layout as putInDisk.
 */
export function putInDiskStream<N extends FolderNamespace>(
  disk: StorageDiskPort,
  options: PutInDiskStreamOptions<N>,
): Effect.Effect<string, StorageError> {
  return Effect.tryPromise({
    try: async () => {
      const fileKey = buildStorageKey(options)
      if (!fileKey) throw new Error(`Unknown storage namespace: ${options.namespace}`)

      await disk.putStream(fileKey, options.stream)
      return fileKey
    },
    catch: (cause) => new StorageError({ cause, operation: "putInDiskStream" }),
  })
}

/**
 * Reads file contents from object storage.
 */
export function getFromDisk(disk: StorageDiskPort, key: string): Effect.Effect<Uint8Array, StorageError> {
  return Effect.tryPromise({
    try: () => disk.getBytes(key),
    catch: (cause) => new StorageError({ cause, operation: "getFromDisk" }),
  })
}

/**
 * Deletes a file from object storage.
 */
export function deleteFromDisk(disk: StorageDiskPort, key: string): Effect.Effect<void, StorageError> {
  return Effect.tryPromise({
    try: () => disk.delete(key),
    catch: (cause) => new StorageError({ cause, operation: "deleteFromDisk" }),
  })
}

type AppendStorageOptions = {
  readonly namespace: "exports"
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly filename: string
  readonly fileKey?: string
  readonly content: string | Uint8Array
}

/**
 * Appends content to an existing file in object storage.
 * Creates the file if it doesn't exist.
 * Returns the fileKey for the appended content.
 */
export function appendToDisk(
  disk: StorageDiskPort,
  options: AppendStorageOptions,
): Effect.Effect<string, StorageError> {
  return Effect.tryPromise({
    try: async () => {
      const fileKey = options.fileKey ?? buildStorageKey(options)
      if (!fileKey) throw new Error(`Unknown storage namespace: ${options.namespace}`)

      // Read existing content if file exists
      let existingContent: Uint8Array = new Uint8Array()
      try {
        existingContent = await disk.getBytes(fileKey)
      } catch {
        // File doesn't exist yet, start with empty content
      }

      // Append new content
      const newContent =
        typeof options.content === "string" ? new TextEncoder().encode(options.content) : options.content

      const combined = new Uint8Array(existingContent.length + newContent.length)
      combined.set(existingContent)
      combined.set(newContent, existingContent.length)

      await disk.put(fileKey, combined)
      return fileKey
    },
    catch: (cause) => new StorageError({ cause, operation: "appendToDisk" }),
  })
}
