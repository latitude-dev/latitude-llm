import { Readable } from "node:stream"
import type { StorageDiskPort } from "@domain/shared"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"
import { Disk } from "flydrive"
import { S3Driver } from "flydrive/drivers/s3"
import { createFsDriverEffect } from "./fs-url-builder.ts"

export type StorageDriver = "fs" | "s3"

/**
 * Adapts a flydrive Disk to the StorageDiskPort interface.
 * Converts between Web Standard ReadableStream and Node.js Readable.
 */
const adaptDiskToPort = (disk: Disk): StorageDiskPort => ({
  put: (key: string, contents: string | Uint8Array) => disk.put(key, contents),
  putStream: async (key: string, contents: ReadableStream<Uint8Array>) => {
    const reader = contents.getReader()
    const chunks: Uint8Array[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const combined = new Uint8Array(totalLength)
    let offset = 0
    for (const chunk of chunks) {
      combined.set(chunk, offset)
      offset += chunk.length
    }
    const readable = Readable.from(Buffer.from(combined))
    await disk.putStream(key, readable)
  },
  get: (key: string) => disk.get(key),
  getStream: async (key: string) => {
    const nodeStream = await disk.getStream(key)
    return new ReadableStream<Uint8Array>({
      start(controller) {
        nodeStream.on("data", (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk))
        })
        nodeStream.on("end", () => {
          controller.close()
        })
        nodeStream.on("error", (error) => {
          controller.error(error)
        })
      },
    })
  },
  delete: (key: string) => disk.delete(key),
  getSignedUrl: (key: string, options?: { expiresIn?: number }) => disk.getSignedUrl(key, options),
})

export type StorageDisk = StorageDiskPort

export const createStorageDiskEffect = (): Effect.Effect<StorageDisk> =>
  Effect.orDie(
    Effect.gen(function* () {
      const driver = yield* parseEnv("LAT_STORAGE_DRIVER", "string", "fs")

      if (driver === "s3") {
        const bucket = yield* parseEnv("LAT_STORAGE_S3_BUCKET", "string")
        const region = yield* parseEnv("LAT_STORAGE_S3_REGION", "string")
        const endpoint = yield* parseEnvOptional("LAT_STORAGE_S3_ENDPOINT", "string")

        const s3Driver = new S3Driver({
          credentials: {
            accessKeyId: yield* parseEnv("LAT_STORAGE_S3_ACCESS_KEY_ID", "string"),
            secretAccessKey: yield* parseEnv("LAT_STORAGE_S3_SECRET_ACCESS_KEY", "string"),
          },
          region,
          bucket,
          ...(endpoint && { endpoint }),
          visibility: "private",
        })

        return adaptDiskToPort(new Disk(s3Driver))
      }

      const fsDriver = yield* createFsDriverEffect()
      return adaptDiskToPort(new Disk(fsDriver))
    }),
  )

export const createStorageDisk = (): StorageDisk => Effect.runSync(createStorageDiskEffect())
