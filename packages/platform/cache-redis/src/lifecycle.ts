import type { Redis } from "ioredis"

/**
 * Gracefully close a Redis connection (QUIT). Falls back to disconnect if quit fails.
 * Safe to call multiple times or on an already-closed client.
 */
export const closeRedis = async (client: Redis): Promise<void> => {
  if (client.status === "end" || client.status === "close") {
    return
  }
  try {
    await client.quit()
  } catch {
    client.disconnect()
  }
}
