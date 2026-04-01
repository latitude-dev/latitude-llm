export { InvalidEnvValueError, MissingEnvValueError } from "@platform/env"
// Re-export drizzle-orm helpers to ensure consistent type instances
export { asc, eq, inArray } from "drizzle-orm"
export type { Operator, PostgresClient, PostgresConfig, PostgresDb } from "./client.ts"
export {
  closePostgres,
  createPostgresClient,
  createPostgresPool,
} from "./client.ts"
export {
  type BetterAuthConfig,
  createBetterAuth,
  type Session,
  type StripePlanConfig,
  type User,
} from "./create-better-auth.ts"
export { healthcheckPostgres } from "./health.ts"
// Outbox consumer for reliable event publishing
export {
  createPollingOutboxConsumer,
  type OutboxConsumer,
  OutboxConsumerError,
  type OutboxEventRow,
  type PollingOutboxConsumerConfig,
} from "./outbox-consumer.ts"
export { createOutboxWriter, OutboxEventWriterLive } from "./outbox-writer.ts"
export { ApiKeyRepositoryLive } from "./repositories/api-key-repository.ts"
// Repository implementations
export { DatasetRepositoryLive } from "./repositories/dataset-repository.ts"
export { InvitationRepositoryLive } from "./repositories/invitation-repository.ts"
export { IssueRepositoryLive } from "./repositories/issue-repository.ts"
export { MembershipRepositoryLive } from "./repositories/membership-repository.ts"
export { OrganizationRepositoryLive } from "./repositories/organization-repository.ts"
export { ProjectRepositoryLive } from "./repositories/project-repository.ts"
export { ScoreRepositoryLive } from "./repositories/score-repository.ts"
export { SettingsReaderLive } from "./repositories/settings-reader-repository.ts"
export { UserRepositoryLive } from "./repositories/user-repository.ts"
// SqlClient implementation
export { SqlClientLive } from "./sql-client.ts"
export { withPostgres } from "./with-postgres.ts"
