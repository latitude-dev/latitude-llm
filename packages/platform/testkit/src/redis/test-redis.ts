import { createRedisClient, createRedisConnection } from "@platform/cache-redis"
import { Effect } from "effect"
import type { Redis } from "ioredis"

/**
 * Test Redis configuration
 */
export interface TestRedisConfig {
  readonly database?: number
  readonly host?: string
  readonly port?: number
}

/**
 * Test Redis client
 */
export interface TestRedis {
  readonly client: Redis
  readonly config: TestRedisConfig
}

/**
 * Create a test Redis connection
 *
 * Uses TEST_REDIS_URL or falls back to localhost:6379 with a test database index.
 * Default test database index is 15 to avoid conflicts with production/dev data.
 */
export const createTestRedis = (config: TestRedisConfig = {}): TestRedis => {
  const testDbIndex = config.database ?? 15

  const redisConn = createRedisConnection(config.host, config.port)

  const client = createRedisClient(redisConn)
  // Switch to test database
  client.select(testDbIndex)

  return {
    client,
    config: {
      ...config,
      database: testDbIndex,
    },
  }
}

/**
 * Create a test Redis connection wrapped in Effect
 */
export const createTestRedisEffect = (config: TestRedisConfig = {}): Effect.Effect<TestRedis, Error> => {
  return Effect.try({
    try: () => createTestRedis(config),
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  })
}

/**
 * Clear all keys in the test Redis database
 */
export const clearTestRedis = async (testRedis: TestRedis): Promise<void> => {
  await testRedis.client.flushdb()
}

/**
 * Clear test Redis wrapped in Effect
 */
export const clearTestRedisEffect = (testRedis: TestRedis): Effect.Effect<void, Error> => {
  return Effect.tryPromise({
    try: () => clearTestRedis(testRedis),
    catch: (error) => (error instanceof Error ? error : new Error(`Failed to clear test Redis: ${String(error)}`)),
  })
}

/**
 * Close test Redis connection
 */
export const closeTestRedis = async (testRedis: TestRedis): Promise<void> => {
  await testRedis.client.quit()
}

/**
 * Close test Redis connection wrapped in Effect
 */
export const closeTestRedisEffect = (testRedis: TestRedis): Effect.Effect<void, Error> => {
  return Effect.tryPromise({
    try: () => closeTestRedis(testRedis),
    catch: (error) => (error instanceof Error ? error : new Error(`Failed to close test Redis: ${String(error)}`)),
  })
}
