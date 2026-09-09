import type { OpenClawAgentContext } from "./types.ts"

const TAG_MAX_CHARS = 64
export const TAG_MAX_COUNT = 32
const METADATA_VALUE_MAX_CHARS = 1024
const METADATA_MAX_KEYS = 64

export interface Sender {
  id: string
  name?: string | undefined
  username?: string | undefined
}

export interface CronJob {
  id: string
  name?: string | undefined
}

/** Everything a run knows about itself that turns into tags and metadata. */
interface RunContext {
  ctx: OpenClawAgentContext
  sender?: Sender | undefined
  cron?: CronJob | undefined
  subagentIds: string[]
  pluginVersion: string
}

interface Enrichment {
  tags: string[]
  metadata: Record<string, string>
}

/**
 * Derived tags: `openclaw`, the channel, the agent id, `cron:<job>` (or the
 * bare trigger for other non-user triggers) and `subagent:<agent>` on a run
 * that spawned one. Operator tags are appended. Tags are what `queryAnalytics`
 * can break down on, so they stay low-cardinality; ids go in metadata.
 */
export function deriveEnrichment(
  run: RunContext,
  operator: { tags: readonly string[]; metadata: Readonly<Record<string, string>> },
): Enrichment {
  const { ctx } = run
  const tags: string[] = ["openclaw"]
  if (ctx.channel) tags.push(ctx.channel)
  if (ctx.agentId) tags.push(ctx.agentId)
  if (ctx.trigger === "cron") tags.push(run.cron ? `cron:${run.cron.id}` : "cron")
  else if (ctx.trigger && ctx.trigger !== "user") tags.push(ctx.trigger)
  for (const id of run.subagentIds) tags.push(`subagent:${id}`)
  for (const tag of operator.tags) tags.push(tag)

  const metadata: Record<string, string> = {}
  for (const [k, v] of Object.entries(operator.metadata)) {
    if (k.startsWith("openclaw.")) continue
    metadata[k] = v
  }
  const derived: Record<string, string | undefined> = {
    "openclaw.run.id": ctx.runId,
    "openclaw.session.id": ctx.sessionId,
    "openclaw.session.key": ctx.sessionKey,
    "openclaw.agent.id": ctx.agentId,
    "openclaw.workspace.dir": ctx.workspaceDir,
    "openclaw.channel": ctx.channel,
    "openclaw.channel.id": ctx.channelId,
    "openclaw.account.id": ctx.accountId,
    "openclaw.message.provider": ctx.messageProvider,
    "openclaw.trigger": ctx.trigger,
    "openclaw.model.provider.id": ctx.modelProviderId,
    "openclaw.model.id": ctx.modelId,
    "openclaw.cron.job.id": run.cron?.id,
    "openclaw.cron.job.name": run.cron?.name,
    "openclaw.sender.id": run.sender?.id,
    "openclaw.sender.name": run.sender?.name,
    "openclaw.sender.username": run.sender?.username,
    "openclaw.trace.id": ctx.trace?.traceId,
    "openclaw.plugin.version": run.pluginVersion,
  }
  for (const [k, v] of Object.entries(derived)) {
    if (v !== undefined && v !== "") metadata[k] = v
  }

  return { tags: capTags(tags), metadata: capMetadata(metadata) }
}

function capTags(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const tag of tags) {
    const trimmed = tag.trim()
    if (trimmed.length === 0 || trimmed.length > TAG_MAX_CHARS || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
    if (out.length >= TAG_MAX_COUNT) break
  }
  return out
}

function capMetadata(metadata: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  let count = 0
  for (const [k, v] of Object.entries(metadata)) {
    if (v.length > METADATA_VALUE_MAX_CHARS) continue
    out[k] = v
    count++
    if (count >= METADATA_MAX_KEYS) break
  }
  return out
}

const CTX_MARKER = "⟦openclaw:ctx⟧"

/**
 * OpenClaw prefixes channel prompts with a fenced JSON block after
 * `⟦openclaw:ctx⟧` that carries the sender's id and display name; the only
 * place the name reaches a run when `message_received` did not.
 */
export function senderFromPrompt(prompt: string | undefined): Sender | undefined {
  if (!prompt) return undefined
  const marker = prompt.indexOf(CTX_MARKER)
  if (marker < 0) return undefined
  const fenceStart = prompt.indexOf("```json", marker)
  if (fenceStart < 0) return undefined
  const bodyStart = prompt.indexOf("\n", fenceStart)
  const fenceEnd = prompt.indexOf("```", bodyStart + 1)
  if (bodyStart < 0 || fenceEnd < 0) return undefined
  try {
    const parsed = JSON.parse(prompt.slice(bodyStart + 1, fenceEnd)) as {
      sender?: { id?: unknown; name?: unknown; username?: unknown }
    }
    const sender = parsed.sender
    if (!sender || typeof sender.id !== "string" || sender.id.length === 0) return undefined
    return {
      id: sender.id,
      name: typeof sender.name === "string" && sender.name.length > 0 ? sender.name : undefined,
      username: typeof sender.username === "string" && sender.username.length > 0 ? sender.username : undefined,
    }
  } catch {
    return undefined
  }
}

/** `agent:<agentId>:cron:<jobId>[:run:<runId>]` is the isolated cron session key shape. */
export function cronJobFromSessionKey(sessionKey: string | undefined): string | undefined {
  if (!sessionKey) return undefined
  const match = /^agent:[^:]+:cron:([^:]+)/.exec(sessionKey)
  return match?.[1]
}
