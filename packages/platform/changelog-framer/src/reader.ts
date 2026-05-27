import { type ChangelogEntry, ChangelogReadError, ChangelogReader } from "@domain/changelog"
import { parseEnv } from "@platform/env"
import { Effect, Layer } from "effect"
import { connect } from "framer-api"

/** CMS collection that holds changelog entries (matched by name). */
const CHANGELOG_COLLECTION_NAME = "Changelog"

/**
 * Framer assigns opaque, stable IDs to CMS fields. These map the Latitude
 * "Changelog" collection's fields to our entity. If the collection's fields
 * are deleted and recreated in Framer, these IDs change and must be updated.
 */
const FIELD = {
  title: "kOcd2RkZy",
  publishedAt: "xTS8qzuAR",
  summary: "EsBafd9Vo",
  category: "VNJ0I2D1T",
} as const

interface FramerFieldValue {
  readonly type: string
  readonly value?: unknown
}

interface FramerItem {
  readonly id: string
  readonly slug: string
  readonly draft: boolean
  readonly fieldData: Record<string, FramerFieldValue | undefined>
}

interface FramerCollection {
  readonly id: string
  readonly name: string
  getItems(): Promise<readonly FramerItem[]>
}

interface FramerClient {
  getCollections(): Promise<readonly FramerCollection[]>
  disconnect(): Promise<void>
}

const stringField = (fieldData: FramerItem["fieldData"], id: string): string | null => {
  const value = fieldData[id]?.value
  return typeof value === "string" && value.length > 0 ? value : null
}

const toEntry = (item: FramerItem): ChangelogEntry | null => {
  const title = stringField(item.fieldData, FIELD.title)
  const rawDate = item.fieldData[FIELD.publishedAt]?.value
  const publishedAt = typeof rawDate === "string" ? new Date(rawDate) : null
  if (title === null || publishedAt === null || Number.isNaN(publishedAt.getTime())) {
    return null
  }
  return {
    id: item.id,
    slug: item.slug,
    title,
    summary: stringField(item.fieldData, FIELD.summary),
    category: stringField(item.fieldData, FIELD.category),
    publishedAt,
  }
}

const isNonNull = <T>(value: T | null): value is T => value !== null

const fetchEntries = (
  projectUrl: string,
  apiKey: string,
): Effect.Effect<readonly ChangelogEntry[], ChangelogReadError> =>
  Effect.tryPromise({
    try: async () => {
      const framer = (await connect(projectUrl, apiKey)) as unknown as FramerClient
      try {
        const collections = await framer.getCollections()
        const collection = collections.find(
          (candidate) => candidate.name.toLowerCase() === CHANGELOG_COLLECTION_NAME.toLowerCase(),
        )
        if (!collection) {
          throw new Error(`Framer collection "${CHANGELOG_COLLECTION_NAME}" not found`)
        }
        const items = await collection.getItems()
        return items
          .filter((item) => !item.draft)
          .map(toEntry)
          .filter(isNonNull)
      } finally {
        await framer.disconnect()
      }
    },
    catch: (cause) => new ChangelogReadError({ message: `Framer changelog read failed: ${String(cause)}`, cause }),
  })

/**
 * Live {@link ChangelogReader} backed by the Framer Server API.
 *
 * Reads `LAT_FRAMER_PROJECT_URL` and `LAT_FRAMER_API_KEY`. Connection setup
 * happens per `list()` call; cache the result upstream (the use-case caches via
 * `CacheStore`) so this only runs on a cold cache.
 */
export const ChangelogReaderLive = Layer.effect(
  ChangelogReader,
  Effect.gen(function* () {
    const projectUrl = yield* parseEnv("LAT_FRAMER_PROJECT_URL", "string")
    const apiKey = yield* parseEnv("LAT_FRAMER_API_KEY", "string")
    return {
      list: () => fetchEntries(projectUrl, apiKey),
    }
  }),
)
