import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { OrganizationId, ProjectId } from "./id.ts"
import { appendToDisk, type StorageDiskPort } from "./storage.ts"

const decoder = new TextDecoder()

describe("appendToDisk", () => {
  it("reuses the provided file key when appending to an existing export", async () => {
    const files = new Map<string, Uint8Array>()
    const disk: StorageDiskPort = {
      put: async (key, contents) => {
        files.set(key, typeof contents === "string" ? new TextEncoder().encode(contents) : contents)
      },
      putStream: async () => {
        throw new Error("Unexpected putStream")
      },
      get: async (key) => decoder.decode(files.get(key) ?? new Uint8Array()),
      getBytes: async (key) => {
        const value = files.get(key)
        if (!value) {
          throw new Error(`Missing file for key ${key}`)
        }
        return value
      },
      getStream: async () => {
        throw new Error("Unexpected getStream")
      },
      delete: async (key) => {
        files.delete(key)
      },
      getSignedUrl: async (key) => `https://download.test/${key}`,
    }

    const firstKey = await Effect.runPromise(
      appendToDisk(disk, {
        namespace: "exports",
        organizationId: OrganizationId("o".repeat(24)),
        projectId: ProjectId("p".repeat(24)),
        filename: "issues.zip",
        content: "first",
      }),
    )

    const secondKey = await Effect.runPromise(
      appendToDisk(disk, {
        namespace: "exports",
        organizationId: OrganizationId("o".repeat(24)),
        projectId: ProjectId("p".repeat(24)),
        filename: "issues.zip",
        fileKey: firstKey,
        content: " second",
      }),
    )

    expect(secondKey).toBe(firstKey)
    expect(files.size).toBe(1)
    expect(decoder.decode(files.get(firstKey))).toBe("first second")
  })
})
