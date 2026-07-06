import { createHmac, randomBytes } from "node:crypto"
import {
  AGENT_DISPATCH_FLAG,
  AGENT_DISPATCH_KINDS,
  AGENT_DISPATCH_TRIGGERS,
  type AgentDispatchConfig,
  AgentDispatchConfigRepository,
  AgentDispatchCredentialRepository,
  AgentDispatchIntegrationRepository,
  type AgentDispatchKind,
  AgentDispatchRepository,
  AgentDispatchTraceReader,
  agentDispatchGuardrailsSchema,
  agentDispatchKindSchema,
  agentDispatchTargetSchema,
  buildDispatchContextFromSignal,
  buildManualDispatchIdempotencyKey,
  connectAgentDispatchIntegrationUseCase,
  disconnectAgentDispatchIntegrationUseCase,
  renderDispatchPrompt,
  sendAgentDispatchUseCase,
  upsertAgentDispatchConfigUseCase,
} from "@domain/agent-dispatch"
import { hasFeatureFlagUseCase } from "@domain/feature-flags"
import { OrganizationId, ProjectId, SignalId } from "@domain/shared"
import { SignalRepository } from "@domain/signals"
import { TraceRepository } from "@domain/spans"
import { AgentDispatchAdaptersLive } from "@platform/agent-dispatch"
import { ScoreAnalyticsRepositoryLive, TraceRepositoryLive, withClickHouse } from "@platform/db-clickhouse"
import {
  AgentDispatchConfigRepositoryLive,
  AgentDispatchCredentialRepositoryLive,
  AgentDispatchIntegrationRepositoryLive,
  AgentDispatchRepositoryLive,
  FeatureFlagRepositoryLive,
  OrganizationRepositoryLive,
  ProjectRepositoryLive,
  ScoreRepositoryLive,
  SignalRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { parseEnv } from "@platform/env"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getClickhouseClient, getPostgresClient } from "../../server/clients.ts"

export interface AgentDispatchRecord {
  readonly id: string
  readonly trigger: string
  readonly sourceType: string
  readonly sourceId: string
  readonly sourceName: string | null
  readonly status: string
  readonly claimedAt: string
  readonly dispatchedAt: string | null
  readonly externalUrl: string | null
  readonly routineUrl: string | null
  readonly errorCategory: string | null
  readonly errorDetail: string | null
  readonly kind: AgentDispatchKind | null
}

export interface AgentDispatchIntegrationRecord {
  readonly id: string
  readonly kind: AgentDispatchKind
  readonly vendorAccountId: string
  readonly installedAt: string
}

export interface AgentDispatchConfigRecord {
  readonly id: string
  readonly integrationId: string
  readonly kind: AgentDispatchKind
  readonly enabled: boolean
  readonly triggers: readonly string[]
  readonly target: AgentDispatchConfig["target"]
  readonly promptTemplate: string | null
  readonly guardrails: AgentDispatchConfig["guardrails"]
  readonly updatedAt: string
}

interface CursorRepositoryRecord {
  readonly owner: string
  readonly name: string
  readonly repository: string
}

interface LinearMemberRecord {
  readonly id: string
  readonly name: string
  readonly email: string | null
}

interface LinearTeamRecord {
  readonly id: string
  readonly key: string
  readonly name: string
}

const cursorRepositoriesResponseSchema = z.object({
  repositories: z.array(
    z.object({
      owner: z.string(),
      name: z.string(),
      repository: z.string().url(),
    }),
  ),
})

const linearMembersResponseSchema = z.object({
  data: z.object({
    users: z.object({
      nodes: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          email: z.string().nullable().optional(),
        }),
      ),
    }),
  }),
})

const linearTeamsResponseSchema = z.object({
  data: z.object({
    teams: z.object({
      nodes: z.array(
        z.object({
          id: z.string(),
          key: z.string(),
          name: z.string(),
        }),
      ),
    }),
  }),
})

const agentDispatchLayer = Layer.mergeAll(
  AgentDispatchIntegrationRepositoryLive,
  AgentDispatchCredentialRepositoryLive,
  AgentDispatchConfigRepositoryLive,
  AgentDispatchRepositoryLive,
)

const parseKindFromIdempotencyKey = (key: string): AgentDispatchKind | null => {
  const vendor = key.split(":")[0]
  return agentDispatchKindSchema.safeParse(vendor).success ? (vendor as AgentDispatchKind) : null
}

const toDispatchRecord = (row: {
  id: string
  trigger: string
  sourceType: string
  sourceId: string
  status: string
  claimedAt: Date
  dispatchedAt: Date | null
  externalUrl: string | null
  errorCategory: string | null
  errorDetail: string | null
  idempotencyKey: string
}): AgentDispatchRecord => ({
  id: row.id,
  trigger: row.trigger,
  sourceType: row.sourceType,
  sourceId: row.sourceId,
  sourceName: null,
  status: row.status,
  claimedAt: row.claimedAt.toISOString(),
  dispatchedAt: row.dispatchedAt?.toISOString() ?? null,
  externalUrl: row.externalUrl,
  routineUrl: null,
  errorCategory: row.errorCategory,
  errorDetail: row.errorDetail,
  kind: parseKindFromIdempotencyKey(row.idempotencyKey),
})

async function fetchLinearMembers(linearApiKey: string): Promise<LinearMemberRecord[]> {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: linearApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `query LatitudeAgentDispatchMembers { users(first: 100, includeDisabled: false) { nodes { id name email } } }`,
    }),
  })

  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Linear rejected this API key."
        : "Could not load Linear users.",
    )
  }

  const parsed = linearMembersResponseSchema.safeParse(await response.json())
  if (!parsed.success) return []
  return parsed.data.data.users.nodes.map((user) => ({ id: user.id, name: user.name, email: user.email ?? null }))
}

async function fetchLinearTeams(linearApiKey: string): Promise<LinearTeamRecord[]> {
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: linearApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: `query LatitudeAgentDispatchTeams { teams(first: 100) { nodes { id key name } } }`,
    }),
  })

  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Linear rejected this API key."
        : "Could not load Linear teams.",
    )
  }

  const parsed = linearTeamsResponseSchema.safeParse(await response.json())
  if (!parsed.success) return []
  return parsed.data.data.teams.nodes
}

async function fetchCursorRepositories(cursorApiKey: string): Promise<CursorRepositoryRecord[]> {
  const response = await fetch("https://api.cursor.com/v0/repositories", {
    headers: {
      Authorization: `Basic ${btoa(`${cursorApiKey}:`)}`,
    },
  })

  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Cursor rejected this API key."
        : "Could not load Cursor repositories.",
    )
  }

  const parsed = cursorRepositoriesResponseSchema.safeParse(await response.json())
  return parsed.success ? parsed.data.repositories : []
}

const toConfigRecord = (config: AgentDispatchConfig): AgentDispatchConfigRecord => ({
  id: config.id,
  integrationId: config.integrationId,
  kind: config.kind,
  enabled: config.enabled,
  triggers: config.triggers,
  target: config.target,
  promptTemplate: config.promptTemplate,
  guardrails: config.guardrails,
  updatedAt: config.updatedAt.toISOString(),
})

export const isAgentDispatchEnabled = createServerFn({ method: "GET" }).handler(async () => {
  const { organizationId } = await requireSession()
  const enabled = await Effect.runPromise(
    hasFeatureFlagUseCase({ identifier: AGENT_DISPATCH_FLAG }).pipe(
      withPostgres(FeatureFlagRepositoryLive, getPostgresClient(), organizationId),
      withTracing,
    ),
  )
  return { enabled }
})

export const listAgentDispatchIntegrations = createServerFn({ method: "GET" }).handler(async () => {
  const { organizationId } = await requireSession()
  const client = getPostgresClient()

  const integrations = await Effect.runPromise(
    Effect.gen(function* () {
      const repo = yield* AgentDispatchIntegrationRepository
      const results: AgentDispatchIntegrationRecord[] = []
      for (const kind of AGENT_DISPATCH_KINDS) {
        const row = yield* repo.findActiveByKind(kind)
        if (row) {
          results.push({
            id: row.id,
            kind: row.kind,
            vendorAccountId: row.vendorAccountId,
            installedAt: row.installedAt.toISOString(),
          })
        }
      }
      return results
    }).pipe(withPostgres(AgentDispatchIntegrationRepositoryLive, client, organizationId), withTracing),
  )

  return integrations
})

export const listAgentDispatches = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const projectId = ProjectId(data.projectId)
    const rows = await Effect.runPromise(
      Effect.gen(function* () {
        const dispatchRepo = yield* AgentDispatchRepository
        const configRepo = yield* AgentDispatchConfigRepository
        const signalRepository = yield* SignalRepository
        const dispatches = yield* dispatchRepo.listByProject(projectId)
        const configs = yield* configRepo.listByProject(projectId)
        const configById = new Map(configs.map((config) => [config.id, config]))
        const signalIds = dispatches
          .filter((dispatch) => dispatch.sourceType === "signal")
          .map((dispatch) => SignalId(dispatch.sourceId))
        const signals = signalIds.length > 0 ? yield* signalRepository.findByIds({ projectId, signalIds }) : []
        const signalNameById = new Map<string, string>(signals.map((signal) => [signal.id, signal.name]))

        return dispatches.map((dispatch) => {
          const config = configById.get(dispatch.configId)
          const routineUrl =
            config?.kind === "claude_code" && "routineTriggerId" in config.target
              ? `https://claude.ai/code/routines/${config.target.routineTriggerId}`
              : null

          return {
            ...toDispatchRecord(dispatch),
            sourceName: dispatch.sourceType === "signal" ? (signalNameById.get(dispatch.sourceId) ?? null) : null,
            routineUrl,
          }
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(AgentDispatchRepositoryLive, AgentDispatchConfigRepositoryLive, SignalRepositoryLive),
          getPostgresClient(),
          organizationId,
        ),
        withTracing,
      ),
    )
    return rows
  })

export const listCursorRepositories = createServerFn({ method: "GET" })
  .inputValidator(z.object({ integrationId: z.string() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const credentials = await Effect.runPromise(
      Effect.gen(function* () {
        const credentialRepo = yield* AgentDispatchCredentialRepository
        return yield* credentialRepo.getDecrypted(data.integrationId)
      }).pipe(withPostgres(AgentDispatchCredentialRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )

    if (!credentials.cursorApiKey) return []

    return fetchCursorRepositories(credentials.cursorApiKey)
  })

export const listLinearMembers = createServerFn({ method: "GET" })
  .inputValidator(z.object({ integrationId: z.string() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const credentials = await Effect.runPromise(
      Effect.gen(function* () {
        const credentialRepo = yield* AgentDispatchCredentialRepository
        return yield* credentialRepo.getDecrypted(data.integrationId)
      }).pipe(withPostgres(AgentDispatchCredentialRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )

    if (!credentials.linearApiKey) return []
    return fetchLinearMembers(credentials.linearApiKey)
  })

export const listLinearTeams = createServerFn({ method: "GET" })
  .inputValidator(z.object({ integrationId: z.string() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const credentials = await Effect.runPromise(
      Effect.gen(function* () {
        const credentialRepo = yield* AgentDispatchCredentialRepository
        return yield* credentialRepo.getDecrypted(data.integrationId)
      }).pipe(withPostgres(AgentDispatchCredentialRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )

    if (!credentials.linearApiKey) return []
    return fetchLinearTeams(credentials.linearApiKey)
  })

export const listLinearTeamsForApiKey = createServerFn({ method: "POST" })
  .inputValidator(z.object({ linearApiKey: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireSession()
    return fetchLinearTeams(data.linearApiKey)
  })

export const listCursorRepositoriesForApiKey = createServerFn({ method: "POST" })
  .inputValidator(z.object({ cursorApiKey: z.string().min(1) }))
  .handler(async ({ data }) => {
    await requireSession()
    return fetchCursorRepositories(data.cursorApiKey)
  })

export const getWebhookSecret = createServerFn({ method: "GET" })
  .inputValidator(z.object({ integrationId: z.string() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const credentials = await Effect.runPromise(
      Effect.gen(function* () {
        const credentialRepo = yield* AgentDispatchCredentialRepository
        return yield* credentialRepo.getDecrypted(data.integrationId)
      }).pipe(withPostgres(AgentDispatchCredentialRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )

    return { webhookSecret: credentials.webhookSecret ?? null }
  })

export const getAgentDispatchConfig = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), kind: agentDispatchKindSchema }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    return Effect.runPromise(
      Effect.gen(function* () {
        const integrationRepo = yield* AgentDispatchIntegrationRepository
        const configRepo = yield* AgentDispatchConfigRepository
        const integration = yield* integrationRepo.findActiveByKind(data.kind)
        if (!integration) return null
        const config = yield* configRepo.findByProjectAndIntegration({
          projectId: ProjectId(data.projectId),
          integrationId: integration.id,
        })
        return config ? toConfigRecord(config) : null
      }).pipe(withPostgres(agentDispatchLayer, client, organizationId), withTracing),
    )
  })

export const connectCursorIntegration = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      kind: z.literal("cursor"),
      cursorApiKey: z.string().min(1),
      projectId: z.string(),
      repoUrl: z.string().url(),
      startingRef: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { organizationId, userId } = await requireSession()
    const client = getPostgresClient()

    return Effect.runPromise(
      Effect.gen(function* () {
        const integration = yield* connectAgentDispatchIntegrationUseCase({
          kind: "cursor",
          vendorAccountId: `cursor:${data.repoUrl}`,
          installedByUserId: userId,
          organizationId: OrganizationId(organizationId),
          cursorApiKey: data.cursorApiKey,
        })
        yield* upsertAgentDispatchConfigUseCase({
          organizationId: OrganizationId(organizationId),
          projectId: ProjectId(data.projectId),
          integrationId: integration.id,
          kind: "cursor",
          enabled: true,
          triggers: ["signal.discovered"],
          target: {
            repoUrl: data.repoUrl,
            ...(data.startingRef ? { startingRef: data.startingRef } : {}),
          },
        })
        return { integrationId: integration.id }
      }).pipe(withPostgres(agentDispatchLayer, client, organizationId), withTracing),
    )
  })

export const connectClaudeIntegration = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      kind: z.literal("claude_code"),
      claudeRoutineToken: z.string().min(1),
      routineTriggerId: z.string().min(1),
      projectId: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { organizationId, userId } = await requireSession()
    const client = getPostgresClient()

    return Effect.runPromise(
      Effect.gen(function* () {
        const integration = yield* connectAgentDispatchIntegrationUseCase({
          kind: "claude_code",
          vendorAccountId: `claude:${data.routineTriggerId}`,
          installedByUserId: userId,
          organizationId: OrganizationId(organizationId),
          claudeRoutineToken: data.claudeRoutineToken,
        })
        yield* upsertAgentDispatchConfigUseCase({
          organizationId: OrganizationId(organizationId),
          projectId: ProjectId(data.projectId),
          integrationId: integration.id,
          kind: "claude_code",
          enabled: true,
          triggers: ["signal.discovered"],
          target: { routineTriggerId: data.routineTriggerId },
        })
        return { integrationId: integration.id }
      }).pipe(withPostgres(agentDispatchLayer, client, organizationId), withTracing),
    )
  })

export const connectLinearIntegration = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      kind: z.literal("linear"),
      linearApiKey: z.string().min(1),
      teamId: z.string().uuid(),
      projectId: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { organizationId, userId } = await requireSession()
    const client = getPostgresClient()

    return Effect.runPromise(
      Effect.gen(function* () {
        const integration = yield* connectAgentDispatchIntegrationUseCase({
          kind: "linear",
          vendorAccountId: `linear:${data.teamId}`,
          installedByUserId: userId,
          organizationId: OrganizationId(organizationId),
          linearApiKey: data.linearApiKey,
        })
        yield* upsertAgentDispatchConfigUseCase({
          organizationId: OrganizationId(organizationId),
          projectId: ProjectId(data.projectId),
          integrationId: integration.id,
          kind: "linear",
          enabled: true,
          triggers: ["signal.discovered"],
          target: { teamId: data.teamId },
        })
        return { integrationId: integration.id }
      }).pipe(withPostgres(agentDispatchLayer, client, organizationId), withTracing),
    )
  })

export const connectWebhookIntegration = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      kind: z.literal("webhook"),
      webhookUrl: z.string().url(),
      projectId: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    const { organizationId, userId } = await requireSession()
    const client = getPostgresClient()
    const webhookSecret = randomBytes(32).toString("hex")

    return Effect.runPromise(
      Effect.gen(function* () {
        const integration = yield* connectAgentDispatchIntegrationUseCase({
          kind: "webhook",
          vendorAccountId: createHmac("sha256", webhookSecret).update(data.webhookUrl).digest("hex").slice(0, 32),
          installedByUserId: userId,
          organizationId: OrganizationId(organizationId),
          webhookSecret,
        })
        yield* upsertAgentDispatchConfigUseCase({
          organizationId: OrganizationId(organizationId),
          projectId: ProjectId(data.projectId),
          integrationId: integration.id,
          kind: "webhook",
          enabled: true,
          triggers: ["signal.discovered"],
          target: { webhookUrl: data.webhookUrl },
        })
        return { integrationId: integration.id, webhookSecret }
      }).pipe(withPostgres(agentDispatchLayer, client, organizationId), withTracing),
    )
  })

export const disconnectAgentDispatchIntegration = createServerFn({ method: "POST" })
  .inputValidator(z.object({ integrationId: z.string() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    await Effect.runPromise(
      disconnectAgentDispatchIntegrationUseCase({ integrationId: data.integrationId }).pipe(
        withPostgres(agentDispatchLayer, client, organizationId),
        withTracing,
      ),
    )
    return { disconnected: true }
  })

const upsertConfigSchema = z.object({
  projectId: z.string(),
  integrationId: z.string(),
  kind: agentDispatchKindSchema,
  enabled: z.boolean(),
  triggers: z.array(z.enum(AGENT_DISPATCH_TRIGGERS)).min(1),
  target: agentDispatchTargetSchema,
  promptTemplate: z.string().nullable().optional(),
  guardrails: agentDispatchGuardrailsSchema.optional(),
})

export interface SendToDestinationRecord {
  readonly configId: string
  readonly kind: AgentDispatchKind
}

type SendSignalToIntegrationResult =
  | { readonly status: "dispatched"; readonly externalUrl: string | null }
  | { readonly status: "skipped-already-dispatched" }
  | { readonly status: "failed"; readonly reason: string }

const resolveWebAppUrl = (): string =>
  Effect.runSync(parseEnv("LAT_WEB_URL", "string", "http://localhost:3000")).replace(/\/$/, "")

const AgentDispatchTraceReaderLive = Layer.effect(
  AgentDispatchTraceReader,
  Effect.gen(function* () {
    const traces = yield* TraceRepository
    return AgentDispatchTraceReader.of({
      findMessagesByTraceId: (input) =>
        traces.findByTraceId(input).pipe(Effect.map((trace) => trace.allMessages as readonly unknown[])),
    })
  }),
)

const manualContextPgLayer = Layer.mergeAll(
  OrganizationRepositoryLive,
  ProjectRepositoryLive,
  SignalRepositoryLive,
  ScoreRepositoryLive,
)

const manualContextChLayer = Layer.mergeAll(
  ScoreAnalyticsRepositoryLive,
  TraceRepositoryLive,
  AgentDispatchTraceReaderLive.pipe(Layer.provide(TraceRepositoryLive)),
)

const buildManualSignalContext = (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly signalId: SignalId
}) =>
  buildDispatchContextFromSignal({
    ...input,
    webAppUrl: resolveWebAppUrl(),
    trigger: "manual",
  })

export const listSendToDestinations = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }): Promise<readonly SendToDestinationRecord[]> => {
    const { organizationId } = await requireSession()

    const configs = await Effect.runPromise(
      Effect.gen(function* () {
        const configRepo = yield* AgentDispatchConfigRepository
        return yield* configRepo.listEnabledByProject(ProjectId(data.projectId))
      }).pipe(withPostgres(AgentDispatchConfigRepositoryLive, getPostgresClient(), organizationId), withTracing),
    )

    return configs.map((config) => ({ configId: config.id, kind: config.kind }))
  })

export const getSignalDispatchPrompt = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), signalId: z.string() }))
  .handler(async ({ data }): Promise<{ prompt: string }> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const signalId = SignalId(data.signalId)

    const prompt = await Effect.runPromise(
      buildManualSignalContext({ organizationId: orgId, projectId, signalId }).pipe(
        Effect.map((context) => renderDispatchPrompt({ context })),
        withPostgres(manualContextPgLayer, getPostgresClient(), organizationId),
        withClickHouse(manualContextChLayer, getClickhouseClient(), orgId),
        withTracing,
      ),
    )

    return { prompt }
  })

const manualSendPgLayer = Layer.mergeAll(
  manualContextPgLayer,
  AgentDispatchConfigRepositoryLive,
  AgentDispatchRepositoryLive,
  AgentDispatchCredentialRepositoryLive,
  FeatureFlagRepositoryLive,
)

export const sendSignalToIntegration = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      signalId: z.string(),
      configId: z.string(),
      sendId: z.string().min(1),
    }),
  )
  .handler(async ({ data }): Promise<SendSignalToIntegrationResult> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const signalId = SignalId(data.signalId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const enabled = yield* hasFeatureFlagUseCase({ identifier: AGENT_DISPATCH_FLAG })
        if (!enabled) return yield* Effect.fail(new Error("Agent dispatch is not enabled for this organization"))

        const configRepo = yield* AgentDispatchConfigRepository
        const config = yield* configRepo.findById(data.configId)
        if (config.projectId !== projectId || !config.enabled) {
          return yield* Effect.fail(new Error("This integration is not available for this project"))
        }

        const context = yield* buildManualSignalContext({ organizationId: orgId, projectId, signalId })
        const prompt = renderDispatchPrompt({ context, template: config.promptTemplate })

        const outcome = yield* sendAgentDispatchUseCase({
          configId: config.id,
          projectId,
          integrationId: config.integrationId,
          kind: config.kind,
          idempotencyKey: buildManualDispatchIdempotencyKey({
            vendor: config.kind,
            configId: config.id,
            sourceId: data.signalId,
            sendId: data.sendId,
          }),
          trigger: "manual",
          sourceType: "signal",
          sourceId: data.signalId,
          prompt,
          context,
          target: { ...config.target, kind: config.kind },
        }).pipe(
          Effect.catchTag("DispatchAdapterError", (error) =>
            Effect.succeed({ status: "failed" as const, reason: error.reason }),
          ),
        )

        if (outcome.status === "dispatched") {
          return { status: "dispatched", externalUrl: outcome.externalUrl ?? null } as const
        }
        return outcome
      }).pipe(
        withPostgres(manualSendPgLayer, getPostgresClient(), organizationId),
        withClickHouse(manualContextChLayer, getClickhouseClient(), orgId),
        Effect.provide(AgentDispatchAdaptersLive),
        withTracing,
        Effect.catch((error: unknown) =>
          Effect.succeed({
            status: "failed" as const,
            reason: error instanceof Error ? error.message : "Unknown error",
          }),
        ),
      ),
    )
  })

export const upsertAgentDispatchConfig = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => upsertConfigSchema.parse(data))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const config = await Effect.runPromise(
      upsertAgentDispatchConfigUseCase({
        organizationId: OrganizationId(organizationId),
        projectId: ProjectId(data.projectId),
        integrationId: data.integrationId,
        kind: data.kind,
        enabled: data.enabled,
        triggers: data.triggers,
        target: data.target,
        ...(data.promptTemplate !== undefined ? { promptTemplate: data.promptTemplate } : {}),
        ...(data.guardrails !== undefined ? { guardrails: data.guardrails } : {}),
      }).pipe(withPostgres(AgentDispatchConfigRepositoryLive, client, organizationId), withTracing),
    )

    return toConfigRecord(config)
  })
