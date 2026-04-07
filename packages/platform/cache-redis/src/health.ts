import type { Redis } from "ioredis"

/** ioredis connection status string (see `Redis#status`). */
export type RedisConnectionStatus = "wait" | "end" | "close" | "connecting" | "connect" | "ready" | "reconnecting"

export type RedisPingStatus = "ok" | "error" | "skipped"

export interface RedisHealthReport {
  readonly status: RedisConnectionStatus
  readonly ping: RedisPingStatus
  readonly error?: string
}

export const checkRedisHealth = async (client: Redis): Promise<RedisHealthReport> => {
  const status = client.status as RedisConnectionStatus
  if (status === "end" || status === "close") {
    return { status, ping: "skipped", error: "connection closed" }
  }
  try {
    const pong = await client.ping()
    if (pong !== "PONG") {
      return { status, ping: "error", error: `unexpected ping response: ${String(pong)}` }
    }
    return { status, ping: "ok" }
  } catch (error) {
    return {
      status,
      ping: "error",
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
