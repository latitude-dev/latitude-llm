export type { Operator, PostgresClient, PostgresConfig, PostgresDb } from "./client.ts"
export {
  closePostgres,
  createPostgresClient,
  createPostgresPool,
} from "./client.ts"

export { InvalidEnvValueError, MissingEnvValueError } from "@platform/env"
export { healthcheckPostgres } from "./health.ts"

// SqlClient implementation
export { SqlClientLive } from "./sql-client.ts"
export { withPostgres } from "./with-postgres.ts"

// Repository implementations
export { AuthIntentRepositoryLive } from "./repositories/auth-intent-repository.ts"
export { UserRepositoryLive } from "./repositories/user-repository.ts"
export { ApiKeyRepositoryLive } from "./repositories/api-key-repository.ts"
export { ProjectRepositoryLive } from "./repositories/project-repository.ts"
export { GrantRepositoryLive } from "./repositories/grant-repository.ts"
export { SubscriptionRepositoryLive } from "./repositories/subscription-repository.ts"
export { MembershipRepositoryLive } from "./repositories/membership-repository.ts"
export { OrganizationRepositoryLive } from "./repositories/organization-repository.ts"
export { DatasetRepositoryLive } from "./repositories/dataset-repository.ts"

export * from "./schema/index.ts"
