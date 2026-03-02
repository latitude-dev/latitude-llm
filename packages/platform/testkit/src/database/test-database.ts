import { type PostgresClient, type PostgresConfig, closePostgres, createPostgresClient } from "@platform/db-postgres"
import { Effect } from "effect"

/**
 * Test database configuration
 */
export interface TestDatabaseConfig extends PostgresConfig {
  readonly migrationsPath?: string
}

/**
 * Test database client with lifecycle management
 */
export interface TestDatabase extends PostgresClient {
  readonly config: TestDatabaseConfig
}

/**
 * Create a test database connection
 *
 * Uses LAT_DATABASE_URL_TEST env var if available, otherwise falls back
 * to LAT_DATABASE_URL with a test schema prefix.
 */
export const createTestDatabase = (config: TestDatabaseConfig = {}): TestDatabase => {
  const testDatabaseUrl = process.env.LAT_DATABASE_URL_TEST || process.env.LAT_DATABASE_URL

  if (!testDatabaseUrl) {
    throw new Error("Neither LAT_DATABASE_URL_TEST nor LAT_DATABASE_URL environment variable is set")
  }

  const client = createPostgresClient({
    ...config,
    databaseUrl: testDatabaseUrl,
    maxConnections: config.maxConnections ?? 5,
    connectionTimeoutMs: config.connectionTimeoutMs ?? 5000,
  })

  return {
    ...client,
    config: {
      ...config,
      databaseUrl: testDatabaseUrl,
    },
  }
}

/**
 * Create a test database connection wrapped in Effect
 */
export const createTestDatabaseEffect = (config: TestDatabaseConfig = {}): Effect.Effect<TestDatabase, Error> => {
  return Effect.try({
    try: () => createTestDatabase(config),
    catch: (error) => (error instanceof Error ? error : new Error(String(error))),
  })
}

/**
 * Close test database connection
 */
export const closeTestDatabase = async (db: TestDatabase): Promise<void> => {
  await closePostgres(db.pool)
}

/**
 * Close test database connection wrapped in Effect
 */
export const closeTestDatabaseEffect = (db: TestDatabase): Effect.Effect<void, Error> => {
  return Effect.tryPromise({
    try: () => closeTestDatabase(db),
    catch: (error) => (error instanceof Error ? error : new Error(`Failed to close test database: ${String(error)}`)),
  })
}

/**
 * Generate a unique test identifier for test isolation
 *
 * Use this to generate unique slugs, emails, etc. to avoid conflicts
 * between tests running in parallel.
 */
export const generateTestId = (): string => {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `test_${timestamp}_${random}`
}
