import { createHmac, randomBytes } from "node:crypto"
import {
  AGENT_DISPATCH_KINDS,
  AGENT_DISPATCH_TRIGGERS,
  AgentDispatchConfigRepository,
  type AgentDispatchConfigRow,
  AgentDispatchCredentialRepository,
  type AgentDispatchGuardrails,
  AgentDispatchIntegrationRepository,
  type AgentDispatchKind,
  AgentDispatchRepository,
  AgentDispatchTraceReader,
  agentDispatchGuardrailsSchema,
  agentDispatchKindSchema,
  buildDispatchContextFromSignal,
  buildManualDispatchIdempotencyKey,
  checkTargetReadiness,
  connectAgentDispatchIntegrationUseCase,
  DEFAULT_COOLDOWN_MINUTES,
  DEFAULT_MAX_DISPATCHES_PER_DAY,
  disconnectAgentDispatchIntegrationUseCase,
  type EffectiveAgentDispatchConfig,
  renderDispatchPrompt,
  resetProjectDispatchOverrideUseCase,
  resolveEffectiveConfig,
  resolveEffectiveConfigsForProject,
  type StoredAgentDispatchTarget,
  sendAgentDispatchUseCase,
  setProjectDispatchRepoUseCase,
  storedAgentDispatchTargetSchema,
  upsertOrgDefaultDispatchConfigUseCase,
  upsertProjectDispatchOverrideUseCase,
} from "@domain/agent-dispatch"
import { IncidentMonitorReader } from "@domain/notifications"
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
  IncidentMonitorReaderLive,
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
  readonly sourceSlug: string | null
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
  readonly target: StoredAgentDispatchTarget | null
  readonly promptTemplate: string | null
  readonly guardrails: AgentDispatchGuardrails
  readonly updatedAt: string
}

interface AgentDispatchOverrideRecord {
  readonly id: string
  readonly integrationId: string
  readonly kind: AgentDispatchKind
  readonly enabled: boolean | null
  readonly triggers: readonly string[] | null
  readonly target: StoredAgentDispatchTarget | null
  readonly promptTemplate: string | null
  readonly guardrails: AgentDispatchGuardrails | null
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
  sourceSlug: null,
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

const DEFAULT_GUARDRAILS: AgentDispatchGuardrails = {
  maxDispatchesPerDay: DEFAULT_MAX_DISPATCHES_PER_DAY,
  cooldownMinutes: DEFAULT_COOLDOWN_MINUTES,
}

const toConfigRecord = (config: AgentDispatchConfigRow): AgentDispatchConfigRecord => ({
  id: config.id,
  integrationId: config.integrationId,
  kind: config.kind,
  enabled: config.enabled ?? false,
  triggers: config.triggers ?? [],
  target: config.target,
  promptTemplate: config.promptTemplate,
  guardrails: config.guardrails ?? DEFAULT_GUARDRAILS,
  updatedAt: config.updatedAt.toISOString(),
})

const toOverrideRecord = (config: AgentDispatchConfigRow): AgentDispatchOverrideRecord => ({
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

const toEffectiveRecord = (effective: EffectiveAgentDispatchConfig, updatedAt: Date): AgentDispatchConfigRecord => ({
  id: effective.id,
  integrationId: effective.integrationId,
  kind: effective.kind,
  enabled: effective.enabled,
  triggers: effective.triggers,
  target: effective.target,
  promptTemplate: effective.promptTemplate,
  guardrails: effective.guardrails,
  updatedAt: updatedAt.toISOString(),
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
        const monitorReader = yield* IncidentMonitorReader
        const dispatches = yield* dispatchRepo.listByProject(projectId)
        const configs = yield* configRepo.listByProjectIncludingDefaults(projectId)
        const configById = new Map(configs.map((config) => [config.id, config]))
        const signalIds = dispatches
          .filter((dispatch) => dispatch.sourceType === "signal")
          .map((dispatch) => SignalId(dispatch.sourceId))
        const signals = signalIds.length > 0 ? yield* signalRepository.findByIds({ projectId, signalIds }) : []
        const signalNameById = new Map<string, string>(signals.map((signal) => [signal.id, signal.name]))
        const monitorIds = [
          ...new Set(
            dispatches.filter((dispatch) => dispatch.sourceType === "monitor").map((dispatch) => dispatch.sourceId),
          ),
        ]
        const monitors = yield* Effect.forEach(monitorIds, (monitorId) =>
          monitorReader.findByMonitorId(monitorId).pipe(Effect.map((monitor) => ({ monitorId, monitor }))),
        )
        const monitorById = new Map(
          monitors
            .filter(
              (entry): entry is { monitorId: string; monitor: NonNullable<typeof entry.monitor> } =>
                entry.monitor !== null,
            )
            .map((entry) => [entry.monitorId, entry.monitor]),
        )

        return dispatches.map((dispatch) => {
          const config = configById.get(dispatch.configId)
          const routineUrl =
            config?.kind === "claude_code" && config.target && "routineTriggerId" in config.target
              ? `https://claude.ai/code/routines/${config.target.routineTriggerId}`
              : null
          const monitor = dispatch.sourceType === "monitor" ? monitorById.get(dispatch.sourceId) : undefined

          return {
            ...toDispatchRecord(dispatch),
            sourceName:
              dispatch.sourceType === "signal"
                ? (signalNameById.get(dispatch.sourceId) ?? null)
                : dispatch.sourceType === "monitor"
                  ? (monitor?.name ?? null)
                  : null,
            sourceSlug: dispatch.sourceType === "monitor" ? (monitor?.slug ?? null) : null,
            routineUrl,
          }
        })
      }).pipe(
        withPostgres(
          Layer.mergeAll(
            AgentDispatchRepositoryLive,
            AgentDispatchConfigRepositoryLive,
            SignalRepositoryLive,
            IncidentMonitorReaderLive,
          ),
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

export const getOrgDefaultDispatchConfig = createServerFn({ method: "GET" })
  .inputValidator(z.object({ kind: agentDispatchKindSchema }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    return Effect.runPromise(
      Effect.gen(function* () {
        const integrationRepo = yield* AgentDispatchIntegrationRepository
        const configRepo = yield* AgentDispatchConfigRepository
        const integration = yield* integrationRepo.findActiveByKind(data.kind)
        if (!integration) return null
        const config = yield* configRepo.findDefaultByIntegration(integration.id)
        return config ? toConfigRecord(config) : null
      }).pipe(withPostgres(agentDispatchLayer, client, organizationId), withTracing),
    )
  })

interface ProjectDispatchSettingsRecord {
  readonly integrationId: string | null
  readonly defaultConfig: AgentDispatchConfigRecord | null
  readonly override: AgentDispatchOverrideRecord | null
  readonly effective: AgentDispatchConfigRecord | null
}

export const getProjectDispatchSettings = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), kind: agentDispatchKindSchema }))
  .handler(async ({ data }): Promise<ProjectDispatchSettingsRecord> => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()
    const projectId = ProjectId(data.projectId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const integrationRepo = yield* AgentDispatchIntegrationRepository
        const configRepo = yield* AgentDispatchConfigRepository
        const integration = yield* integrationRepo.findActiveByKind(data.kind)
        if (!integration) return { integrationId: null, defaultConfig: null, override: null, effective: null }
        const [defaultRow, overrideRow] = yield* Effect.all([
          configRepo.findDefaultByIntegration(integration.id),
          configRepo.findOverrideByProjectAndIntegration({ projectId, integrationId: integration.id }),
        ])
        const effective = resolveEffectiveConfig({ projectId, defaultConfig: defaultRow, override: overrideRow })
        const effectiveUpdatedAt = new Date(
          Math.max(defaultRow?.updatedAt.getTime() ?? 0, overrideRow?.updatedAt.getTime() ?? 0),
        )
        return {
          integrationId: integration.id,
          defaultConfig: defaultRow ? toConfigRecord(defaultRow) : null,
          override: overrideRow ? toOverrideRecord(overrideRow) : null,
          effective: effective ? toEffectiveRecord(effective, effectiveUpdatedAt) : null,
        }
      }).pipe(withPostgres(agentDispatchLayer, client, organizationId), withTracing),
    )
  })

export const connectCursorIntegration = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      kind: z.literal("cursor"),
      projectId: z.string(),
      cursorApiKey: z.string().min(1),
      repoUrl: z.string().url().optional(),
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
          vendorAccountId: `cursor:${organizationId}`,
          installedByUserId: userId,
          organizationId: OrganizationId(organizationId),
          cursorApiKey: data.cursorApiKey,
        })
        const config = yield* upsertProjectDispatchOverrideUseCase({
          organizationId: OrganizationId(organizationId),
          projectId: ProjectId(data.projectId),
          integrationId: integration.id,
          kind: "cursor",
          enabled: true,
          triggers: ["signal.discovered"],
          target: {
            ...(data.repoUrl ? { repoUrl: data.repoUrl } : {}),
            ...(data.startingRef ? { startingRef: data.startingRef } : {}),
          },
        })
        return { integrationId: integration.id, config: toConfigRecord(config) }
      }).pipe(withPostgres(agentDispatchLayer, client, organizationId), withTracing),
    )
  })

export const connectClaudeIntegration = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      kind: z.literal("claude_code"),
      projectId: z.string(),
      claudeRoutineToken: z.string().min(1),
      routineTriggerId: z.string().min(1),
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
        yield* upsertProjectDispatchOverrideUseCase({
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
      projectId: z.string(),
      linearApiKey: z.string().min(1),
      teamId: z.string().uuid(),
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
        yield* upsertProjectDispatchOverrideUseCase({
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
      projectId: z.string(),
      webhookUrl: z.string().url(),
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
        yield* upsertProjectDispatchOverrideUseCase({
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

const orgDefaultConfigSchema = z.object({
  integrationId: z.string(),
  kind: agentDispatchKindSchema,
  enabled: z.boolean(),
  triggers: z.array(z.enum(AGENT_DISPATCH_TRIGGERS)),
  target: storedAgentDispatchTargetSchema,
  promptTemplate: z.string().nullable().optional(),
  guardrails: agentDispatchGuardrailsSchema.optional(),
})

const projectOverrideSchema = z.object({
  projectId: z.string(),
  integrationId: z.string(),
  kind: agentDispatchKindSchema,
  enabled: z.boolean().nullable().optional(),
  triggers: z.array(z.enum(AGENT_DISPATCH_TRIGGERS)).nullable().optional(),
  target: storedAgentDispatchTargetSchema.nullable().optional(),
  promptTemplate: z.string().nullable().optional(),
  guardrails: agentDispatchGuardrailsSchema.nullable().optional(),
})

export interface SendToDestinationRecord {
  readonly integrationId: string
  readonly kind: AgentDispatchKind
  readonly configId: string | null
  readonly ready: boolean
  readonly missing: readonly string[]
}

type SendSignalToIntegrationResult =
  | { readonly status: "dispatched"; readonly externalUrl: string | null }
  | { readonly status: "skipped-already-dispatched" }
  | { readonly status: "not-ready"; readonly missing: readonly string[] }
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

export const sendToDestinationsQueryKey = (projectId: string) => ["send-to-destinations", projectId] as const

export const listSendToDestinations = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }): Promise<readonly SendToDestinationRecord[]> => {
    const { organizationId } = await requireSession()
    const projectId = ProjectId(data.projectId)

    return Effect.runPromise(
      Effect.gen(function* () {
        const integrationRepo = yield* AgentDispatchIntegrationRepository
        const configRepo = yield* AgentDispatchConfigRepository
        const rows = yield* configRepo.listByProjectIncludingDefaults(projectId)
        const effectiveByIntegration = new Map(
          resolveEffectiveConfigsForProject(projectId, rows).map((config) => [config.integrationId, config]),
        )

        const destinations: SendToDestinationRecord[] = []
        for (const kind of AGENT_DISPATCH_KINDS) {
          const integration = yield* integrationRepo.findActiveByKind(kind)
          if (!integration) continue
          const effective = effectiveByIntegration.get(integration.id)
          // Manual send-to is gated on the credential + a complete target, not `enabled`;
          // `enabled` only governs automatic dispatch, so a disabled integration is still
          // manually sendable.
          const readiness = checkTargetReadiness(kind, effective?.target ?? null)
          destinations.push({
            integrationId: integration.id,
            kind,
            configId: effective?.id ?? null,
            ready: readiness.ready,
            missing: readiness.ready ? [] : readiness.missing,
          })
        }
        return destinations
      }).pipe(withPostgres(agentDispatchLayer, getPostgresClient(), organizationId), withTracing),
    )
  })

type GetSignalDispatchPromptResult = { readonly prompt: string } | { readonly error: string }

export const getSignalDispatchPrompt = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string(), signalId: z.string() }))
  .handler(async ({ data }): Promise<GetSignalDispatchPromptResult> => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const projectId = ProjectId(data.projectId)
    const signalId = SignalId(data.signalId)

    return Effect.runPromise(
      buildManualSignalContext({ organizationId: orgId, projectId, signalId }).pipe(
        Effect.map((context) => ({ prompt: renderDispatchPrompt({ context }) })),
        withPostgres(manualContextPgLayer, getPostgresClient(), organizationId),
        withClickHouse(manualContextChLayer, getClickhouseClient(), orgId),
        withTracing,
        Effect.catch((error: unknown) =>
          Effect.succeed({
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        ),
      ),
    )
  })

const manualSendPgLayer = Layer.mergeAll(
  manualContextPgLayer,
  AgentDispatchIntegrationRepositoryLive,
  AgentDispatchConfigRepositoryLive,
  AgentDispatchRepositoryLive,
  AgentDispatchCredentialRepositoryLive,
)

export const sendSignalToIntegration = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      projectId: z.string(),
      signalId: z.string(),
      kind: agentDispatchKindSchema,
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
        const integrationRepo = yield* AgentDispatchIntegrationRepository
        const configRepo = yield* AgentDispatchConfigRepository
        const integration = yield* integrationRepo.findActiveByKind(data.kind)
        if (!integration) {
          return yield* Effect.fail(new Error("This integration is not connected"))
        }
        const [defaultRow, overrideRow] = yield* Effect.all([
          configRepo.findDefaultByIntegration(integration.id),
          configRepo.findOverrideByProjectAndIntegration({ projectId, integrationId: integration.id }),
        ])
        const effective = resolveEffectiveConfig({ projectId, defaultConfig: defaultRow, override: overrideRow })
        const readiness = effective
          ? checkTargetReadiness(data.kind, effective.target)
          : ({ ready: false, missing: [] } as const)
        if (!effective || !readiness.ready) {
          return { status: "not-ready", missing: readiness.ready ? [] : readiness.missing } as const
        }

        const context = yield* buildManualSignalContext({ organizationId: orgId, projectId, signalId })
        const prompt = renderDispatchPrompt({ context, template: effective.promptTemplate })

        const outcome = yield* sendAgentDispatchUseCase({
          configId: effective.id,
          projectId,
          integrationId: effective.integrationId,
          kind: effective.kind,
          idempotencyKey: buildManualDispatchIdempotencyKey({
            vendor: effective.kind,
            configId: effective.id,
            sourceId: data.signalId,
            sendId: data.sendId,
          }),
          trigger: "manual",
          sourceType: "signal",
          sourceId: data.signalId,
          prompt,
          context,
          target: readiness.target,
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

export const upsertOrgDefaultDispatchConfig = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => orgDefaultConfigSchema.parse(data))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const config = await Effect.runPromise(
      upsertOrgDefaultDispatchConfigUseCase({
        organizationId: OrganizationId(organizationId),
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

export const upsertProjectDispatchOverride = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => projectOverrideSchema.parse(data))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    const config = await Effect.runPromise(
      upsertProjectDispatchOverrideUseCase({
        organizationId: OrganizationId(organizationId),
        projectId: ProjectId(data.projectId),
        integrationId: data.integrationId,
        kind: data.kind,
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
        ...(data.triggers !== undefined ? { triggers: data.triggers } : {}),
        ...(data.target !== undefined ? { target: data.target } : {}),
        ...(data.promptTemplate !== undefined ? { promptTemplate: data.promptTemplate } : {}),
        ...(data.guardrails !== undefined ? { guardrails: data.guardrails } : {}),
      }).pipe(withPostgres(AgentDispatchConfigRepositoryLive, client, organizationId), withTracing),
    )

    return toOverrideRecord(config)
  })

export const resetProjectDispatchOverride = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string(), integrationId: z.string() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    await Effect.runPromise(
      resetProjectDispatchOverrideUseCase({
        projectId: ProjectId(data.projectId),
        integrationId: data.integrationId,
      }).pipe(withPostgres(AgentDispatchConfigRepositoryLive, client, organizationId), withTracing),
    )
    return { reset: true }
  })

export const setProjectDispatchRepo = createServerFn({ method: "POST" })
  .inputValidator(z.object({ projectId: z.string(), kind: z.literal("cursor"), repoUrl: z.string().url() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const client = getPostgresClient()

    return Effect.runPromise(
      Effect.gen(function* () {
        const integrationRepo = yield* AgentDispatchIntegrationRepository
        const integration = yield* integrationRepo.findActiveByKind(data.kind)
        if (!integration) return yield* Effect.fail(new Error("Cursor is not connected"))
        const config = yield* setProjectDispatchRepoUseCase({
          organizationId: OrganizationId(organizationId),
          projectId: ProjectId(data.projectId),
          integrationId: integration.id,
          repoUrl: data.repoUrl,
        })
        return toOverrideRecord(config)
      }).pipe(withPostgres(agentDispatchLayer, client, organizationId), withTracing),
    )
  })
