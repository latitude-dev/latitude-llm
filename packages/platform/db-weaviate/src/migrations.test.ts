import { Effect } from "effect"
import { describe, expect, it, vi } from "vitest"
import type { WeaviateClient } from "weaviate-client"
import {
  WeaviateCollectionMigrationError,
  defineWeaviateCollections,
  migrateWeaviateCollectionsEffect,
} from "./migrations.ts"

const definitions = defineWeaviateCollections([
  {
    name: "events",
  },
  {
    name: "workspaces",
  },
])

describe("migrateWeaviateCollectionsEffect", () => {
  it("creates collections that do not exist", async () => {
    const exists = vi.fn().mockResolvedValue(false)
    const create = vi.fn().mockResolvedValue(undefined)
    const client = {
      collections: {
        exists,
        create,
      },
    } as unknown as WeaviateClient

    await Effect.runPromise(migrateWeaviateCollectionsEffect(client, definitions))

    expect(exists).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it("skips collections that already exist", async () => {
    const exists = vi.fn().mockResolvedValue(true)
    const create = vi.fn().mockResolvedValue(undefined)
    const client = {
      collections: {
        exists,
        create,
      },
    } as unknown as WeaviateClient

    await Effect.runPromise(migrateWeaviateCollectionsEffect(client, definitions))

    expect(create).not.toHaveBeenCalled()
  })

  it("tolerates race-condition errors with already exists responses", async () => {
    const exists = vi.fn().mockResolvedValue(false)
    const create = vi.fn().mockRejectedValue(new Error("collection already exists"))
    const client = {
      collections: {
        exists,
        create,
      },
    } as unknown as WeaviateClient

    await Effect.runPromise(migrateWeaviateCollectionsEffect(client, definitions))
    expect(create).toHaveBeenCalledTimes(2)
  })

  it("returns typed migration errors for create failures", async () => {
    const exists = vi.fn().mockResolvedValue(false)
    const create = vi.fn().mockRejectedValue(new Error("permission denied"))
    const client = {
      collections: {
        exists,
        create,
      },
    } as unknown as WeaviateClient

    await expect(Effect.runPromise(migrateWeaviateCollectionsEffect(client, definitions))).rejects.toBeInstanceOf(
      WeaviateCollectionMigrationError,
    )
  })
})
