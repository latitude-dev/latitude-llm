import {
  AGENT_DEFAULT_MODEL,
  AGENT_EVENTS_TTL_SECONDS,
  AGENT_MAX_STEPS,
  AGENT_TURN_CLAIM_TTL_SECONDS,
  AGENT_TURN_DEADLINE_MS,
  type AgentEvent,
  type AgentMessageRepository,
  type AgentMessageRole,
  type AgentSessionRepository,
  appendMessagesUseCase,
  buildAgentAbortKey,
  buildAgentDecisionKey,
  buildAgentEventsStreamKey,
  buildAgentSystemPrompt,
  buildAgentTurnClaimKey,
  CONFIRM_ACCESS_LEVELS,
  CONFIRMATION_DEADLINE_MS,
  contentToParts,
  loadTranscriptUseCase,
} from "@domain/agent"
import { type AgentMessage, type AgentToolDef, AIAgent, type RunAgentInput, resolveGenerationConfig } from "@domain/ai"
import { OrganizationRepository } from "@domain/organizations"
import type { QueueConsumer } from "@domain/queue"
import { AgentSessionId, describeError, generateId, OrganizationId, type SqlClient, UserId } from "@domain/shared"
import { AIAgentLive } from "@platform/ai"
import type { RedisClient } from "@platform/cache-redis"
import type { ClickHouseClient } from "@platform/db-clickhouse"
import {
  AgentMessageRepositoryLive,
  AgentSessionRepositoryLive,
  OrganizationRepositoryLive,
  type PostgresClient,
  withPostgres,
} from "@platform/db-postgres"
import { createLogger, withTracing } from "@repo/observability"
import { commandPaletteAgentToolset, type OperationContext } from "@repo/operations"
import { Effect, Layer } from "effect"
import { z } from "zod"

import {
  getClickhouseClient,
  getPostgresClient,
  getQueuePublisher,
  getRedisClient,
  getStorageDisk,
  getWorkflowQuerier,
  getWorkflowStarter,
} from "../clients.ts"

const logger = createLogger("agent-run-turn")
const AGENT_RUN_TURN_QUEUE = "agent-run-turn" as const
const AGENT_RUN_TURN_RUN_TASK = "run" as const

const TOOL_RESULT_MAX_CHARS = 12_000

type DomainServices = SqlClient | AgentSessionRepository | AgentMessageRepository

interface AgentRunTurnPayload {
  readonly sessionId: string
  readonly turnId: string
  readonly organizationId: string
  readonly userId: string
  readonly projectId?: string
  readonly activeProjectSlug?: string
}

type AgentRunTurnLogger = Pick<ReturnType<typeof createLogger>, "info" | "error">

interface AgentRunTurnDeps {
  consumer: QueueConsumer
  clickhouseClient?: ClickHouseClient
  postgresClient?: PostgresClient
  redisClient?: RedisClient
  logger?: AgentRunTurnLogger
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const extractToolBody = (output: unknown): unknown =>
  output !== null && typeof output === "object" && "body" in output ? (output as { body: unknown }).body : output

const truncateToolResult = (value: unknown): unknown => {
  const serialized = JSON.stringify(value)
  if (serialized === undefined || serialized.length <= TOOL_RESULT_MAX_CHARS) return value
  return { truncated: true, preview: serialized.slice(0, TOOL_RESULT_MAX_CHARS) }
}

// Append an event to the session's live Redis stream (best-effort; the SSE route tails it). TTL is
// refreshed on each write so an idle session's stream eventually expires.
const emitEvent = async (
  redisClient: RedisClient,
  organizationId: string,
  sessionId: string,
  event: AgentEvent,
): Promise<void> => {
  const key = buildAgentEventsStreamKey(organizationId, sessionId)
  try {
    await redisClient.xadd(key, "MAXLEN", "~", 1000, "*", "data", JSON.stringify(event))
    await redisClient.expire(key, AGENT_EVENTS_TTL_SECONDS)
  } catch {
    // Live streaming is best-effort; the durable transcript is the source of truth.
  }
}

const claimTurn = (redisClient: RedisClient, payload: AgentRunTurnPayload) =>
  Effect.tryPromise(() =>
    redisClient.set(
      buildAgentTurnClaimKey(payload.organizationId, payload.turnId),
      "1",
      "EX",
      AGENT_TURN_CLAIM_TTL_SECONDS,
      "NX",
    ),
  ).pipe(Effect.map((result) => result === "OK"))

const runAgentTurn = async ({
  deps,
  payload,
}: {
  deps: {
    readonly clickhouseClient: ClickHouseClient
    readonly postgresClient: PostgresClient
    readonly redisClient: RedisClient
  }
  payload: AgentRunTurnPayload
}): Promise<void> => {
  const orgId = OrganizationId(payload.organizationId)
  const { sessionId, organizationId } = payload
  const emit = (event: AgentEvent) => emitEvent(deps.redisClient, organizationId, sessionId, event)

  const provideDomain = <A, E>(effect: Effect.Effect<A, E, DomainServices>): Effect.Effect<A, E> =>
    effect.pipe(
      withPostgres(Layer.mergeAll(AgentSessionRepositoryLive, AgentMessageRepositoryLive), deps.postgresClient, orgId),
      withTracing,
    )

  const [organization, queuePublisher, workflowStarter, workflowQuerier] = await Promise.all([
    Effect.runPromise(
      Effect.gen(function* () {
        const repo = yield* OrganizationRepository
        return yield* repo.findById(orgId)
      }).pipe(withPostgres(OrganizationRepositoryLive, deps.postgresClient, orgId), withTracing),
    ),
    getQueuePublisher(),
    getWorkflowStarter(),
    getWorkflowQuerier(),
  ])

  // The agent acts as the real signed-in user across the org (attribution + any per-operation checks).
  // Authorization is delegated to each operation (RLS); mutations are gated by confirmation below.
  const ctx: OperationContext = {
    organization,
    auth: { method: "api-key", userId: UserId(payload.userId), organizationId: orgId },
    postgresClient: deps.postgresClient,
    clickhouse: deps.clickhouseClient,
    redis: deps.redisClient,
    queuePublisher,
    workflowStarter,
    workflowQuerier,
    storageDisk: getStorageDisk(),
  }

  const controller = new AbortController()

  // Blocks a mutating tool until the user approves it. Non-blocking GET-poll (not BLPOP) to respect the
  // shared client's command timeout; bounded by the confirmation deadline and the turn abort signal.
  const awaitDecision = async (toolCallId: string): Promise<"approve" | "deny"> => {
    const decisionKey = buildAgentDecisionKey(organizationId, sessionId, toolCallId)
    const abortKey = buildAgentAbortKey(organizationId, sessionId)
    const start = Date.now()
    while (Date.now() - start < CONFIRMATION_DEADLINE_MS) {
      if (controller.signal.aborted) return "deny"
      const decision = await deps.redisClient.get(decisionKey).catch(() => null)
      if (decision === "approve" || decision === "deny") {
        await deps.redisClient.del(decisionKey).catch(() => {})
        return decision
      }
      if (await deps.redisClient.get(abortKey).catch(() => null)) return "deny"
      await sleep(400)
    }
    return "deny"
  }

  const runOperation = (toolDef: (typeof commandPaletteAgentToolset.tools)[number], rawInput: unknown) =>
    Effect.runPromise(
      toolDef.invoke(rawInput as Record<string, unknown>, ctx).pipe(
        Effect.match({
          onSuccess: (output) => truncateToolResult(extractToolBody(output)),
          onFailure: (error) => ({ error: describeError(error) }),
        }),
      ),
    )

  const operationTools: AgentToolDef[] = commandPaletteAgentToolset.tools.map((toolDef) => {
    const gated = (CONFIRM_ACCESS_LEVELS as ReadonlyArray<string>).includes(toolDef.access)
    return {
      name: toolDef.name,
      description: toolDef.description,
      inputSchema: toolDef.inputSchema,
      execute: async (rawInput) => {
        if (!gated) return runOperation(toolDef, rawInput)
        const toolCallId = generateId()
        await emit({
          type: "confirmation_request",
          toolCallId,
          toolName: toolDef.name,
          access: toolDef.access,
          title: toolDef.title,
          summary: toolDef.description,
          input: rawInput,
        })
        const decision = await awaitDecision(toolCallId)
        await emit({ type: "confirmation_resolved", toolCallId, approved: decision === "approve" })
        if (decision !== "approve") {
          return { declined: true, reason: "The user did not approve this action." }
        }
        return runOperation(toolDef, rawInput)
      },
    }
  })

  const navigateTool: AgentToolDef = {
    name: "navigateTo",
    description:
      "Navigate the user to an in-app path (e.g. /projects/my-project/signals). Moves the user without closing the palette. Use only for in-app routes.",
    inputSchema: z.object({
      to: z.string().min(1).describe("In-app path to navigate to, starting with '/'."),
    }),
    execute: async (rawInput) => {
      const to = (rawInput as { to?: unknown }).to
      if (typeof to !== "string" || to.length === 0) return { navigated: false, error: "A path is required." }
      await emit({ type: "navigate", to })
      return { navigated: true, to }
    },
  }

  const transcript = await Effect.runPromise(provideDomain(loadTranscriptUseCase(AgentSessionId(sessionId))))
  const messages: AgentMessage[] = transcript.messages.map((message) => ({
    role: message.role,
    content: message.parts,
  }))

  const modelConfig = await Effect.runPromise(resolveGenerationConfig("COMMAND_PALETTE_AGENT", AGENT_DEFAULT_MODEL))

  let lastStatus: string | null = null
  const runInput: RunAgentInput = {
    provider: modelConfig.provider,
    model: modelConfig.model,
    system: buildAgentSystemPrompt({ activeProjectSlug: payload.activeProjectSlug ?? null }),
    prompt: "",
    messages,
    tools: [...operationTools, navigateTool],
    maxSteps: AGENT_MAX_STEPS,
    ...(modelConfig.reasoning !== undefined ? { reasoning: modelConfig.reasoning } : {}),
    ...(modelConfig.maxTokens !== undefined ? { maxTokens: modelConfig.maxTokens } : {}),
    ...(modelConfig.temperature !== undefined ? { temperature: modelConfig.temperature } : {}),
    onStep: (step) => {
      if (step.text === undefined) return
      const clamped = step.text
        .split("\n")
        .find((line) => line.trim().length > 0)
        ?.trim()
        .slice(0, 120)
      if (!clamped || clamped === lastStatus) return
      lastStatus = clamped
      void emit({ type: "status", text: clamped })
    },
  }

  const deadline = setTimeout(() => controller.abort(), AGENT_TURN_DEADLINE_MS)
  try {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const agent = yield* AIAgent
        return yield* agent.runAgent({ ...runInput, abortSignal: controller.signal })
      }).pipe(Effect.provide(AIAgentLive), withTracing),
    )

    const toPersist = result.responseMessages.map((message) => ({
      role: message.role as AgentMessageRole,
      parts: contentToParts(message.content),
    }))
    if (toPersist.length > 0) {
      await Effect.runPromise(
        provideDomain(appendMessagesUseCase({ sessionId: AgentSessionId(sessionId), messages: toPersist })),
      )
    }

    await emit({ type: "assistant_message", text: result.text })
    await emit({ type: "done" })
  } finally {
    clearTimeout(deadline)
  }
}

const runAgentTurnJob =
  (deps: {
    readonly clickhouseClient: ClickHouseClient
    readonly postgresClient: PostgresClient
    readonly redisClient: RedisClient
  }) =>
  (payload: AgentRunTurnPayload) =>
    claimTurn(deps.redisClient, payload).pipe(
      Effect.flatMap((claimed) => {
        if (!claimed) return Effect.void
        return Effect.tryPromise({ try: () => runAgentTurn({ deps, payload }), catch: (error) => error }).pipe(
          Effect.matchEffect({
            onSuccess: () => Effect.void,
            onFailure: (error) =>
              Effect.promise(() =>
                emitEvent(deps.redisClient, payload.organizationId, payload.sessionId, {
                  type: "error",
                  error: describeError(error),
                }),
              ),
          }),
        )
      }),
      Effect.asVoid,
    )

export const createAgentRunTurnWorker = ({
  consumer,
  clickhouseClient,
  postgresClient,
  redisClient,
  logger: injectedLogger,
}: AgentRunTurnDeps) => {
  const chClient = clickhouseClient ?? getClickhouseClient()
  const pgClient = postgresClient ?? getPostgresClient()
  const rdClient = redisClient ?? getRedisClient()
  const turnLogger = injectedLogger ?? logger
  const run = runAgentTurnJob({ clickhouseClient: chClient, postgresClient: pgClient, redisClient: rdClient })

  consumer.subscribe(AGENT_RUN_TURN_QUEUE, {
    run: (payload) =>
      run(payload).pipe(
        Effect.tapError((error) =>
          Effect.sync(() =>
            turnLogger.error("Agent turn failed", {
              queue: AGENT_RUN_TURN_QUEUE,
              task: AGENT_RUN_TURN_RUN_TASK,
              organizationId: payload.organizationId,
              sessionId: payload.sessionId,
              turnId: payload.turnId,
              error,
            }),
          ),
        ),
      ),
  })
}
