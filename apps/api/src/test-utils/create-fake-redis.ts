import type { RedisClient } from "@platform/cache-redis"

export const createFakeRedis = (): RedisClient => {
  const store = new Map<string, string>()
  return {
    status: "ready",
    ping: async () => "PONG",
    get: async (key: string) => store.get(key) ?? null,
    set: async (key: string, value: string) => {
      store.set(key, value)
      return "OK"
    },
    setex: async (key: string, _ttl: number, value: string) => {
      store.set(key, value)
      return "OK"
    },
    del: async (...keys: string[]) => {
      let count = 0
      for (const key of keys) {
        if (store.delete(key)) count++
      }
      return count
    },
  } as unknown as RedisClient
}
