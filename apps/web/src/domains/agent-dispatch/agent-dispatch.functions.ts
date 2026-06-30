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
  agentDispatchGuardrailsSchema,
  agentDispatchKindSchema,
  agentDispatchTargetSchema,
  connectAgentDispatchIntegrationUseCase,
  disconnectAgentDispatchIntegrationUseCase,
  upsertAgentDispatchConfigUseCase,
} from "@domain/agent-dispatch"
import { hasFeatureFlagUseCase } from "@domain/feature-flags"
import { OrganizationId, ProjectId } from "@domain/shared"
import {
  AgentDispatchConfigRepositoryLive,
  AgentDispatchCredentialRepositoryLive,
  AgentDispatchIntegrationRepositoryLive,
  AgentDispatchRepositoryLive,
  FeatureFlagRepositoryLive,
  withPostgres,
} from "@platform/db-postgres"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient } from "../../server/clients.ts"

export interface AgentDispatchRecord {
  readonly id: string
  readonly trigger: string
  readonly sourceType: string
  readonly sourceId: string
  readonly status: string
  readonly claimedAt: string
  readonly dispatchedAt: string | null
  readonly externalUrl: string | null
  readonly errorCategory: string | null
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
  idempotencyKey: string
}): AgentDispatchRecord => ({
  id: row.id,
  trigger: row.trigger,
  sourceType: row.sourceType,
  sourceId: row.sourceId,
  status: row.status,
  claimedAt: row.claimedAt.toISOString(),
  dispatchedAt: row.dispatchedAt?.toISOString() ?? null,
  externalUrl: row.externalUrl,
  errorCategory: row.errorCategory,
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
    }).pipe(withPostgres(AgentDispatchIntegrationRepositoryLive, client, organizationId)),
  )

  return integrations
})

export const listAgentDispatches = createServerFn({ method: "GET" })
  .inputValidator(z.object({ projectId: z.string() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const rows = await Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* AgentDispatchRepository
        return yield* repo.listByProject(ProjectId(data.projectId))
      }).pipe(withPostgres(AgentDispatchRepositoryLive, getPostgresClient(), organizationId)),
    )
    return rows.map((row) => toDispatchRecord(row))
  })

export const listCursorRepositories = createServerFn({ method: "GET" })
  .inputValidator(z.object({ integrationId: z.string() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const credentials = await Effect.runPromise(
      Effect.gen(function* () {
        const credentialRepo = yield* AgentDispatchCredentialRepository
        return yield* credentialRepo.getDecrypted(data.integrationId)
      }).pipe(withPostgres(AgentDispatchCredentialRepositoryLive, getPostgresClient(), organizationId)),
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
      }).pipe(withPostgres(AgentDispatchCredentialRepositoryLive, getPostgresClient(), organizationId)),
    )

    if (!credentials.linearApiKey) return []
    return fetchLinearMembers(credentials.linearApiKey)
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
      }).pipe(withPostgres(AgentDispatchCredentialRepositoryLive, getPostgresClient(), organizationId)),
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
      }).pipe(withPostgres(agentDispatchLayer, client, organizationId)),
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
      }).pipe(withPostgres(agentDispatchLayer, client, organizationId)),
    )
  })

export const connectClaudeIntegration = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      kind: z.literal("claude_code"),
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
        return { integrationId: integration.id }
      }).pipe(withPostgres(agentDispatchLayer, client, organizationId)),
    )
  })

export const connectLinearIntegration = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      kind: z.literal("linear"),
      linearApiKey: z.string().min(1),
      teamId: z.string().min(1),
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
        return { integrationId: integration.id }
      }).pipe(withPostgres(agentDispatchLayer, client, organizationId)),
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
      }).pipe(withPostgres(agentDispatchLayer, client, organizationId)),
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
      }).pipe(withPostgres(AgentDispatchConfigRepositoryLive, client, organizationId)),
    )

    return toConfigRecord(config)
  })
