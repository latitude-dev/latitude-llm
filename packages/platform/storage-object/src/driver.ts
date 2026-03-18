import { Readable } from "node:stream"
import { StorageDisk, type StorageDiskPort } from "@domain/shared"
import { parseEnv, parseEnvOptional } from "@platform/env"
import { Effect, Layer } from "effect"
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
    // flydrive expects Node.js Readable; Readable.fromWeb avoids full buffering
    const readable = Readable.fromWeb(contents as import("node:stream/web").ReadableStream)
    await disk.putStream(key, readable)
  },
  get: (key: string) => disk.get(key),
  getBytes: (key: string) => disk.getBytes(key),
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

export const createStorageDiskEffect = (): Effect.Effect<StorageDiskPort> =>
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

export const createStorageDisk = (): StorageDiskPort => Effect.runSync(createStorageDiskEffect())

export const StorageDiskLive = (disk: StorageDiskPort) => Layer.succeed(StorageDisk, disk)
