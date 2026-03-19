// Database exports
export {
  createApiKeyAuthHeaders,
  createAuthHeaders,
  createBearerAuthHeaders,
  createMockJwtToken,
  createMockSessionContext,
  type TestAuthContext,
  withAuthContext,
} from "./auth/auth-helpers.ts"

// Fixture exports
export {
  type ApiKeyFixture,
  type ApiKeyFixtureInput,
  createApiKeyFixture,
  createMembershipFixture,
  createOrganizationFixture,
  createOrganizationSetup,
  createProjectFixture,
  createUserFixture,
  type MembershipFixture,
  type MembershipFixtureInput,
  type OrganizationFixture,
  type OrganizationFixtureInput,
  type OrganizationSetup,
  type ProjectFixture,
  type ProjectFixtureInput,
  type UserFixture,
  type UserFixtureInput,
} from "./database/fixtures.ts"
export {
  closeTestDatabase,
  closeTestDatabaseEffect,
  createTestDatabase,
  createTestDatabaseEffect,
  generateTestId,
  type TestDatabase,
  type TestDatabaseConfig,
} from "./database/test-database.ts"
// Postgres test utilities (implementation lives in db-postgres to avoid cycle)
export {
  closeInMemoryPostgres,
  createInMemoryPostgres,
  createRlsMiddleware,
  type InMemoryPostgres,
  setupTestPostgres,
} from "@platform/db-postgres"

// Hono test client exports
export {
  createTestClient,
  createTestClientEffect,
  type TestClient,
  type TestRequestOptions,
  type TestResponse,
} from "./hono/test-client.ts"

// ClickHouse test utilities exports
export {
  CLICKHOUSE_SCHEMA_PATH,
  createTestClickHouse,
  loadClickHouseSchema,
  setupTestClickHouse,
  truncateClickHouseTables,
  type TestClickHouse,
} from "./clickhouse/test-clickhouse.ts"

// Redis test utilities exports
export {
  clearTestRedis,
  clearTestRedisEffect,
  closeTestRedis,
  closeTestRedisEffect,
  createTestRedis,
  createTestRedisEffect,
  type TestRedis,
  type TestRedisConfig,
} from "./redis/test-redis.ts"
