import type { RedisClient } from "@platform/cache-redis"

export const createFakeRedis = (): RedisClient => {
  const store = new Map<string, string>()
  const ttls = new Map<string, number>()
  return {
    status: "ready",
    get: async (key: string) => store.get(key) ?? null,
    // Honors the `NX` flag (`set(key, value, "EX", n, "NX")`) so single-use
    // checks like the partner nonce guard are actually exercised.
    set: async (key: string, value: string, ...args: unknown[]) => {
      if (args.includes("NX") && store.has(key)) return null
      store.set(key, value)
      const expiryIndex = args.indexOf("EX")
      const seconds = expiryIndex === -1 ? undefined : args[expiryIndex + 1]
      if (typeof seconds === "number") ttls.set(key, seconds)
      return "OK"
    },
    setex: async (key: string, _ttl: number, value: string) => {
      store.set(key, value)
      return "OK"
    },
    del: async (...keys: string[]) => {
      let count = 0
      for (const key of keys) {
        const deleted = store.delete(key)
        ttls.delete(key)
        if (deleted) count++
      }
      return count
    },
    expire: async (key: string, seconds: number) => {
      if (!store.has(key)) return 0
      ttls.set(key, seconds)
      return 1
    },
    pipeline: () => {
      const commands: Array<"incr" | "ttl"> = []
      let key = ""
      return {
        incr: (nextKey: string) => {
          key = nextKey
          commands.push("incr")
        },
        ttl: (nextKey: string) => {
          key = nextKey
          commands.push("ttl")
        },
        exec: async () =>
          commands.map((command) => {
            if (command === "incr") {
              const count = Number.parseInt(store.get(key) ?? "0", 10) + 1
              store.set(key, String(count))
              return [null, count] as [null, number]
            }

            if (!store.has(key)) return [null, -2] as [null, number]
            return [null, ttls.get(key) ?? -1] as [null, number]
          }),
      }
    },
  } as unknown as RedisClient
}
