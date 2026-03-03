import { gunzipSync, gzipSync } from "node:zlib"
import { type Model, type ModelRepository, parseModelsDevData } from "@domain/models"
import { type RedisClient, createRedisClient, createRedisConnection } from "@platform/cache-redis"

import bundledJson from "./data/models.dev.json" with { type: "json" }

const MODELS_DEV_API_URL = "https://models.dev/api.json"
const REDIS_CACHE_KEY = "models-dev:data"
const CACHE_TTL_SECONDS = 24 * 60 * 60
const FETCH_TIMEOUT_MS = 10_000

function compress(data: string): Buffer {
  return gzipSync(Buffer.from(data, "utf-8"))
}

function decompress(data: Buffer): string {
  return gunzipSync(data).toString("utf-8")
}

function loadBundledModels(): Model[] {
  return parseModelsDevData(bundledJson)
}

async function fetchFromApi(): Promise<{ models: Model[]; rawJson: string }> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(MODELS_DEV_API_URL, {
      signal: controller.signal,
      headers: { "Cache-Control": "no-cache" },
    })

    if (!response.ok) {
      throw new Error(`models.dev API returned ${response.status}`)
    }

    const rawJson = await response.text()
    const data = JSON.parse(rawJson) as unknown
    const models = parseModelsDevData(data)
    return { models, rawJson }
  } finally {
    clearTimeout(timeoutId)
  }
}

async function readFromRedis(redis: RedisClient): Promise<Model[] | null> {
  try {
    const compressed = await redis.getBuffer(REDIS_CACHE_KEY)
    if (!compressed) return null

    const json = decompress(compressed)
    const raw = JSON.parse(json) as unknown
    return parseModelsDevData(raw)
  } catch {
    return null
  }
}

async function writeToRedis(redis: RedisClient, rawJson: string): Promise<void> {
  try {
    const compressed = compress(rawJson)
    await redis.setex(REDIS_CACHE_KEY, CACHE_TTL_SECONDS, compressed)
  } catch {
    // Redis write failures are non-fatal
  }
}

/**
 * Create a ModelRepository backed by models.dev with Redis caching.
 *
 * Resolution order for `getAllModels()`:
 * 1. In-process parsed models (avoids repeated deserialization within same process)
 * 2. Redis cache (gzip-compressed, 24h TTL)
 * 3. Fresh fetch from models.dev API (result written to Redis)
 * 4. Bundled JSON fallback (when both API and Redis are unavailable)
 */
export function createModelsDevRepository(redis?: RedisClient): ModelRepository {
  let localModels: Model[] | null = null
  let localFetchedAt = 0
  let fetchInFlight: Promise<Model[]> | null = null

  const getRedis = (() => {
    let client = redis ?? null
    return () => {
      if (!client) {
        const conn = createRedisConnection()
        client = createRedisClient(conn)
      }
      return client
    }
  })()

  const isLocalCacheValid = () => localModels !== null && Date.now() - localFetchedAt < CACHE_TTL_SECONDS * 1000

  const getAllModels = async (): Promise<Model[]> => {
    if (isLocalCacheValid()) return localModels as Model[]

    if (!fetchInFlight) {
      fetchInFlight = (async () => {
        const redisClient = getRedis()

        const fromRedis = await readFromRedis(redisClient)
        if (fromRedis) {
          localModels = fromRedis
          localFetchedAt = Date.now()
          return fromRedis
        }

        try {
          const { models, rawJson } = await fetchFromApi()
          await writeToRedis(redisClient, rawJson)
          localModels = models
          localFetchedAt = Date.now()
          return models
        } catch {
          const models = loadBundledModels()
          localModels = models
          localFetchedAt = Date.now()
          return models
        }
      })().finally(() => {
        fetchInFlight = null
      })
    }

    return fetchInFlight
  }

  return { getAllModels }
}
