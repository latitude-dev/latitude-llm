import {
  AGENT_DECISION_TTL_SECONDS,
  AGENT_PROMPT_MAX_LENGTH,
  agentConfirmationDecisionSchema,
  buildAgentAbortKey,
  buildAgentDecisionKey,
  loadTranscriptUseCase,
  startTurnUseCase,
} from "@domain/agent"
import { AgentSessionId, generateId, OrganizationId, ProjectId, UserId } from "@domain/shared"
import { AgentMessageRepositoryLive, AgentSessionRepositoryLive, withPostgres } from "@platform/db-postgres"
import { withTracing } from "@repo/observability"
import { createServerFn } from "@tanstack/react-start"
import { Effect, Layer } from "effect"
import { z } from "zod"
import { requireSession } from "../../server/auth.ts"
import { getPostgresClient, getQueuePublisher, getRedisClient } from "../../server/clients.ts"

const AGENT_TURN_RATE_LIMIT = 30
const AGENT_TURN_RATE_WINDOW_SECONDS = 60
const AGENT_ABORT_TTL_SECONDS = 120

const agentRepos = () => Layer.mergeAll(AgentSessionRepositoryLive, AgentMessageRepositoryLive)

const enforceAgentTurnRateLimit = async (
  redis: ReturnType<typeof getRedisClient>,
  organizationId: string,
  userId: string,
): Promise<void> => {
  const key = `org:${organizationId}:agent:ratelimit:${userId}`
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, AGENT_TURN_RATE_WINDOW_SECONDS)
  if (count > AGENT_TURN_RATE_LIMIT) {
    throw new Error("You're sending messages too quickly. Please wait a moment and try again.")
  }
}

/**
 * Opens or continues a command-palette agent chat, records the user's message, and enqueues a turn.
 * The `agent-run-turn` worker runs the turn and streams events over `/api/agent/$sessionId/events`.
 */
export const startAgentTurn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      sessionId: z.string().optional(),
      projectId: z.string().optional(),
      activeProjectSlug: z.string().optional(),
      prompt: z.string().min(1).max(AGENT_PROMPT_MAX_LENGTH),
    }),
  )
  .handler(async ({ data }): Promise<{ readonly sessionId: string; readonly turnId: string }> => {
    const { organizationId, userId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const redis = getRedisClient()
    await enforceAgentTurnRateLimit(redis, organizationId, userId)

    const { session } = await Effect.runPromise(
      startTurnUseCase({
        ...(data.sessionId ? { sessionId: AgentSessionId(data.sessionId) } : {}),
        userId: UserId(userId),
        projectId: data.projectId ? ProjectId(data.projectId) : null,
        text: data.prompt,
      }).pipe(withPostgres(agentRepos(), getPostgresClient(), orgId), withTracing),
    )

    const turnId = generateId()
    const publisher = await getQueuePublisher()
    await Effect.runPromise(
      publisher.publish("agent-run-turn", "run", {
        sessionId: session.id,
        turnId,
        organizationId,
        userId,
        ...(data.projectId ? { projectId: data.projectId } : {}),
        ...(data.activeProjectSlug ? { activeProjectSlug: data.activeProjectSlug } : {}),
      }),
    )

    return { sessionId: session.id, turnId }
  })

/** Loads a session's durable transcript for hydrating the palette on (re)open. */
export const getAgentSession = createServerFn({ method: "GET" })
  .inputValidator(z.object({ sessionId: z.string() }))
  .handler(async ({ data }) => {
    const { organizationId } = await requireSession()
    const orgId = OrganizationId(organizationId)
    const { session, messages } = await Effect.runPromise(
      loadTranscriptUseCase(AgentSessionId(data.sessionId)).pipe(
        withPostgres(agentRepos(), getPostgresClient(), orgId),
        withTracing,
      ),
    )
    return {
      sessionId: session.id as string,
      title: session.title,
      // parts carry `unknown` tool payloads; ship as a JSON string so the server-fn serializer
      // stays happy, and parse on the client.
      messages: messages.map((message) => ({
        id: message.id as string,
        role: message.role,
        parts: JSON.stringify(message.parts),
        createdAt: message.createdAt.toISOString(),
      })),
    }
  })

/** Records the user's approve/deny decision for a pending mutating tool call; the worker is polling for it. */
export const respondToConfirmation = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ sessionId: z.string(), toolCallId: z.string(), decision: agentConfirmationDecisionSchema }),
  )
  .handler(async ({ data }): Promise<{ readonly ok: true }> => {
    const { organizationId } = await requireSession()
    const redis = getRedisClient()
    await redis.set(
      buildAgentDecisionKey(organizationId, data.sessionId, data.toolCallId),
      data.decision,
      "EX",
      AGENT_DECISION_TTL_SECONDS,
    )
    return { ok: true }
  })

/** Signals the worker to abort the running turn (checked between the agent's confirmation polls). */
export const abortAgentTurn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ sessionId: z.string() }))
  .handler(async ({ data }): Promise<{ readonly ok: true }> => {
    const { organizationId } = await requireSession()
    const redis = getRedisClient()
    await redis.set(buildAgentAbortKey(organizationId, data.sessionId), "1", "EX", AGENT_ABORT_TTL_SECONDS)
    return { ok: true }
  })
