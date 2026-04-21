import { Cluster, Redis, type RedisOptions } from "ioredis"
import type { RedisConnection } from "./connection.ts"

type ReadyCapableRedisClient = Redis | Cluster

export const waitForRedisClientReady = async <T extends ReadyCapableRedisClient>(client: T): Promise<T> => {
  if (client.status === "ready") {
    return client
  }

  return new Promise<T>((resolve, reject) => {
    const cleanup = () => {
      client.off("ready", onReady)
      client.off("error", onError)
      client.off("close", onClose)
      client.off("end", onClose)
    }

    const onReady = () => {
      cleanup()
      resolve(client)
    }

    const onError = (error: unknown) => {
      cleanup()
      reject(error)
    }

    const onClose = () => {
      cleanup()
      reject(new Error("Redis client closed before becoming ready"))
    }

    client.once("ready", onReady)
    client.once("error", onError)
    client.once("close", onClose)
    client.once("end", onClose)

    if (client.status === "ready") {
      onReady()
      return
    }

    if (client.status === "wait") {
      void client.connect().catch(onError)
    }
  })
}

export const buildRedisConnectionOptions = (
  connection: Pick<RedisConnection, "host" | "port" | "password" | "tls">,
): Pick<RedisOptions, "host" | "port" | "password" | "tls"> => ({
  host: connection.host,
  port: connection.port,
  ...(connection.password ? { password: connection.password } : {}),
  ...(connection.tls ? { tls: {} } : {}),
})

const passthroughDnsLookup = (
  address: string,
  callback: (error: NodeJS.ErrnoException | null, address: string) => void,
) => {
  callback(null, address)
}

/**
 * Create an ioredis client from connection config
 * Uses Cluster mode if connection.cluster is true (for AWS MemoryDB/ElastiCache)
 */
export const createRedisClient = (connection: RedisConnection): Redis | Cluster => {
  const baseOptions = {
    ...buildRedisConnectionOptions(connection),
    // Fail fast instead of buffering commands indefinitely when Redis is unavailable.
    enableOfflineQueue: false,
    connectTimeout: 5000,
    commandTimeout: 5000,
    maxRetriesPerRequest: 1,
    // Retry strategy with exponential backoff
    retryStrategy: (times: number) => {
      const delay = Math.min(times * 50, 2000)
      return delay
    },
  }

  if (connection.cluster) {
    return new Cluster([{ host: connection.host, port: connection.port }], {
      // AWS MemoryDB/ElastiCache with TLS expects the hostname to be preserved so
      // the cluster client can complete TLS validation while refreshing slots.
      dnsLookup: passthroughDnsLookup,
      // Enable offline queue for cluster mode to handle slot refresh gracefully
      // Commands are queued briefly while cluster topology is being refreshed
      enableOfflineQueue: true,
      redisOptions: {
        ...buildRedisConnectionOptions(connection),
        connectTimeout: 5000,
        commandTimeout: 5000,
        // Let cluster client handle retries via slot refresh mechanism
        maxRetriesPerRequest: null,
      },
    })
  }

  return new Redis({
    ...baseOptions,
    // Default to db 0 for non-cluster mode
    db: 0,
  })
}

/**
 * Type alias for Redis client (can be single-node Redis or Cluster)
 */
export type RedisClient = Redis | Cluster
