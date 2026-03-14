import { parseEnv, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"
import { Disk } from "flydrive"
import { FSDriver } from "flydrive/drivers/fs"
import { S3Driver } from "flydrive/drivers/s3"

export type StorageDriver = "fs" | "s3"

export type StorageDisk = Disk

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

        return new Disk(s3Driver)
      }

      const location = yield* parseEnv("LAT_STORAGE_FS_ROOT", "string")

      const fsDriver = new FSDriver({
        location,
        visibility: "private",
      })

      return new Disk(fsDriver)
    }),
  )

export const createStorageDisk = (): StorageDisk => Effect.runSync(createStorageDiskEffect())
