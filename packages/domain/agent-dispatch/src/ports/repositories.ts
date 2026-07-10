import type {
  ChSqlClient,
  NotFoundError,
  OrganizationId,
  ProjectId,
  RepositoryError,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { Context, type Effect } from "effect"
import type { AgentDispatch } from "../entities/agent-dispatch.ts"
import type { AgentDispatchConfigRow, AgentDispatchKind } from "../entities/agent-dispatch-config.ts"
import type { AgentDispatchTrigger } from "../entities/agent-dispatch-context.ts"
import type { AgentDispatchIntegrationConflictError } from "../errors.ts"

export interface AgentDispatchConfigRepositoryShape {
  readonly listByProjectIncludingDefaults: (
    projectId: ProjectId,
  ) => Effect.Effect<readonly AgentDispatchConfigRow[], RepositoryError, SqlClient>
  readonly findDefaultByIntegration: (
    integrationId: string,
  ) => Effect.Effect<AgentDispatchConfigRow | null, RepositoryError, SqlClient>
  readonly findOverrideByProjectAndIntegration: (input: {
    readonly projectId: ProjectId
    readonly integrationId: string
  }) => Effect.Effect<AgentDispatchConfigRow | null, RepositoryError, SqlClient>
  readonly findById: (id: string) => Effect.Effect<AgentDispatchConfigRow, RepositoryError, SqlClient>
  readonly upsert: (config: AgentDispatchConfigRow) => Effect.Effect<AgentDispatchConfigRow, RepositoryError, SqlClient>
  readonly delete: (id: string) => Effect.Effect<void, RepositoryError, SqlClient>
  readonly deleteByIntegrationId: (integrationId: string) => Effect.Effect<void, RepositoryError, SqlClient>
  readonly countDispatchesInLast24h: (input: {
    readonly configId: string
    readonly projectId: ProjectId
  }) => Effect.Effect<number, RepositoryError, SqlClient>
  readonly hasRecentDispatchForSource: (input: {
    readonly configId: string
    readonly projectId: ProjectId
    readonly sourceId: string
    readonly cooldownMinutes: number
  }) => Effect.Effect<boolean, RepositoryError, SqlClient>
}

export class AgentDispatchConfigRepository extends Context.Service<
  AgentDispatchConfigRepository,
  AgentDispatchConfigRepositoryShape
>()("@domain/agent-dispatch/AgentDispatchConfigRepository") {}

export interface AgentDispatchCredentialRepositoryShape {
  readonly getDecrypted: (integrationId: string) => Effect.Effect<
    {
      readonly cursorApiKey: string | null
      readonly claudeRoutineToken: string | null
      readonly linearApiKey: string | null
      readonly webhookSecret: string | null
    },
    RepositoryError,
    SqlClient
  >
  readonly upsert: (input: {
    readonly integrationId: string
    readonly organizationId: OrganizationId
    readonly cursorApiKey?: string | null
    readonly claudeRoutineToken?: string | null
    readonly linearApiKey?: string | null
    readonly webhookSecret?: string | null
  }) => Effect.Effect<void, RepositoryError, SqlClient>
  readonly delete: (integrationId: string) => Effect.Effect<void, RepositoryError, SqlClient>
}

export class AgentDispatchCredentialRepository extends Context.Service<
  AgentDispatchCredentialRepository,
  AgentDispatchCredentialRepositoryShape
>()("@domain/agent-dispatch/AgentDispatchCredentialRepository") {}

export interface AgentDispatchClaim {
  readonly claimed: boolean
  readonly dispatchId: string | null
}

export interface AgentDispatchRepositoryShape {
  readonly claim: (input: {
    readonly configId: string
    readonly projectId: ProjectId
    readonly idempotencyKey: string
    readonly trigger: AgentDispatchTrigger
    readonly sourceType: "signal" | "monitor"
    readonly sourceId: string
  }) => Effect.Effect<AgentDispatchClaim, RepositoryError, SqlClient>
  readonly markDispatched: (input: {
    readonly dispatchId: string
    readonly externalAgentId?: string
    readonly externalRunId?: string
    readonly externalUrl?: string
  }) => Effect.Effect<boolean, RepositoryError, SqlClient>
  readonly markFailed: (input: {
    readonly dispatchId: string
    readonly errorCategory: string
    readonly errorDetail: string
  }) => Effect.Effect<boolean, RepositoryError, SqlClient>
  readonly markFailedByIdempotencyKey: (input: {
    readonly idempotencyKey: string
    readonly errorCategory: string
    readonly errorDetail: string
  }) => Effect.Effect<boolean, RepositoryError, SqlClient>
  readonly listByProject: (projectId: ProjectId) => Effect.Effect<readonly AgentDispatch[], RepositoryError, SqlClient>
}

export class AgentDispatchRepository extends Context.Service<AgentDispatchRepository, AgentDispatchRepositoryShape>()(
  "@domain/agent-dispatch/AgentDispatchRepository",
) {}

export interface AgentDispatchIntegration {
  readonly id: string
  readonly organizationId: OrganizationId
  readonly kind: AgentDispatchKind
  readonly vendorAccountId: string
  readonly installedByUserId: string
  readonly installedAt: Date
  readonly revokedAt: Date | null
}

export interface AgentDispatchIntegrationRepositoryShape {
  readonly findActiveByKind: (
    kind: AgentDispatchKind,
  ) => Effect.Effect<AgentDispatchIntegration | null, RepositoryError, SqlClient>
  readonly install: (input: {
    readonly kind: AgentDispatchKind
    readonly vendorAccountId: string
    readonly installedByUserId: string
  }) => Effect.Effect<AgentDispatchIntegration, RepositoryError | AgentDispatchIntegrationConflictError, SqlClient>
  readonly revoke: (integrationId: string) => Effect.Effect<void, RepositoryError, SqlClient>
}

export class AgentDispatchIntegrationRepository extends Context.Service<
  AgentDispatchIntegrationRepository,
  AgentDispatchIntegrationRepositoryShape
>()("@domain/agent-dispatch/AgentDispatchIntegrationRepository") {}

export interface AgentDispatchTraceReaderShape {
  readonly findMessagesByTraceId: (input: {
    readonly organizationId: OrganizationId
    readonly projectId: ProjectId
    readonly traceId: TraceId
  }) => Effect.Effect<readonly unknown[], NotFoundError | RepositoryError, ChSqlClient>
}

export class AgentDispatchTraceReader extends Context.Service<
  AgentDispatchTraceReader,
  AgentDispatchTraceReaderShape
>()("@domain/agent-dispatch/AgentDispatchTraceReader") {}
