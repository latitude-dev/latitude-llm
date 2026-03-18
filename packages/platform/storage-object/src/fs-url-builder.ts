import { type InvalidEnvValueError, type MissingEnvValueError, parseEnv, parseEnvOptional } from "@platform/env"
import { Effect } from "effect"
import { FSDriver } from "flydrive/drivers/fs"
import { createSignedExportToken } from "./signed-url-token.ts"

/** Default path for signed download URLs. One route can serve any storage key (key is in the token). */
const DEFAULT_SIGNED_DOWNLOAD_PATH = "/downloads/export"
const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 7 * 24 * 60 * 60

/**
 * Builds the urlBuilder object for FlyDrive's FS driver so that getSignedUrl
 * returns app-hosted signed URLs instead of file paths. Generic: path and
 * signing are supplied by the caller; works with any storage key (key is encoded in the token).
 */
type FsUrlBuilderOptions = {
  readonly webUrl: string
  /** Produce a signed token for the given storage key and expiry (seconds). */
  readonly sign: (key: string, expiresInSeconds: number) => string | Promise<string>
  /** Path for the signed download URL (no query). E.g. "/downloads/export". Can serve any key. */
  readonly pathTemplate: string
  readonly defaultExpiresInSeconds?: number
}

type FsUrlBuilder = {
  generateSignedURL: (key: string, _filePath: string, options?: { expiresIn?: string | number }) => Promise<string>
}

function createFsUrlBuilder(options: FsUrlBuilderOptions): FsUrlBuilder {
  const { webUrl, sign, pathTemplate, defaultExpiresInSeconds = DEFAULT_SIGNED_URL_EXPIRY_SECONDS } = options

  const base = webUrl.replace(/\/$/, "")
  const path = pathTemplate.startsWith("/") ? pathTemplate : `/${pathTemplate}`

  return {
    generateSignedURL: async (key: string, _filePath: string, opts?: { expiresIn?: string | number }) => {
      const expiresInSeconds = typeof opts?.expiresIn === "number" ? opts.expiresIn : defaultExpiresInSeconds
      const token = await sign(key, expiresInSeconds)
      const query = `token=${encodeURIComponent(token)}`
      const separator = path.includes("?") ? "&" : "?"
      return `${base}${path}${separator}${query}`
    },
  }
}

type FsDriverConfig = {
  location: string
  visibility: "private"
  urlBuilder?: FsUrlBuilder
}

/**
 * Builds FS driver config from env: location, optional signed-download urlBuilder
 * (when LAT_WEB_URL and LAT_BETTER_AUTH_SECRET are set). Signed URLs work for any storage key.
 */
const createFsDriverConfigEffect = (): Effect.Effect<FsDriverConfig, MissingEnvValueError | InvalidEnvValueError> =>
  Effect.gen(function* () {
    const location = yield* parseEnv("LAT_STORAGE_FS_ROOT", "string")
    const webUrl = yield* parseEnvOptional("LAT_WEB_URL", "string")
    const authSecret = yield* parseEnvOptional("LAT_BETTER_AUTH_SECRET", "string")
    const urlBuilder =
      webUrl && authSecret
        ? createFsUrlBuilder({
            webUrl,
            pathTemplate: DEFAULT_SIGNED_DOWNLOAD_PATH,
            defaultExpiresInSeconds: DEFAULT_SIGNED_URL_EXPIRY_SECONDS,
            sign: (key, expiresInSeconds) => createSignedExportToken(key, expiresInSeconds, authSecret),
          })
        : undefined

    return {
      location,
      visibility: "private",
      ...(urlBuilder && { urlBuilder }),
    }
  })

/**
 * Creates the FlyDrive FS driver with config from env. Use when LAT_STORAGE_DRIVER=fs.
 */
export const createFsDriverEffect = (): Effect.Effect<FSDriver, MissingEnvValueError | InvalidEnvValueError> =>
  Effect.gen(function* () {
    const config = yield* createFsDriverConfigEffect()
    return new FSDriver(config)
  })
