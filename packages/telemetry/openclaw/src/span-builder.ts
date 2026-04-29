import { createHash, randomUUID } from "node:crypto"
import {
  assistantMessageFromOutput,
  type Message,
  normalizeMessages,
  systemInstructionsParts,
  userMessageFromPrompt,
} from "./messages.ts"
import type {
  OpenClawAfterCompactionEvent,
  OpenClawAfterToolCallEvent,
  OpenClawAgentContext,
  OpenClawAgentEndEvent,
  OpenClawBeforeAgentStartEvent,
  OpenClawBeforeCompactionEvent,
  OpenClawBeforeToolCallEvent,
  OpenClawLlmInputEvent,
  OpenClawLlmOutputEvent,
  OpenClawLlmUsage,
  OpenClawModelCallEndedEvent,
  OpenClawModelCallStartedEvent,
  OpenClawSubagentEndedEvent,
  OpenClawSubagentSpawnedEvent,
} from "./types.ts"

/**
 * Builds the per-trace span tree for an OpenClaw agent run from the granular
 * paired hooks. Replaces the older `turn-builder.ts` model that collapsed the
 * whole attempt into a single `llm_request` span — that shape was wrong on
 * two counts: `llm_input` / `llm_output` fire ONCE per attempt (not per
 * generation), and an attempt is a sequence of generations interleaved with
 * tool executions.
 *
 * Span set this builder produces:
 *
 *   agent (root)
 *   ├─ compaction        (0..1, rare)
 *   ├─ model_call        (1..N, one per provider API call)
 *   ├─ tool_call: ...    (interleaved between model_calls; siblings of agent)
 *   ├─ subagent          (0..N; child agent runs nest INSIDE these via
 *   │   └─ agent ...      cross-runId trace propagation)
 *   └─ model_call        (final)
 *
 * Tool spans are siblings of `agent`, not children of `model_call`, because
 * tools run BETWEEN generations — not during them. Nesting under model_call
 * would falsely imply concurrency.
 *
 * `llm_input` / `llm_output` are NOT span boundaries here. They're data-only
 * feeds that enrich the parent `agent` span (full message history, output
 * messages, aggregate token usage).
 */

// ─── Span record shapes ─────────────────────────────────────────────────────

export interface SpanRecord {
  /** Stable id for the span (16 hex chars). */
  spanId: string
  /** Span tree id (32 hex chars). */
  traceId: string
  /** Empty string for root agent spans, parent's spanId otherwise. */
  parentSpanId: string
  /** OpenClaw event noun (`agent` / `model_call` / `tool_call` / `compaction` / `subagent`). */
  name: string
  startMs: number
  endMs: number | undefined
  /** Free-form attribute bag — flattened to OTLP key/value at emit time. */
  attrs: Record<string, AttrValue>
  /** Status — set at close from the event payload's outcome/error. */
  outcome?: "ok" | "error"
  errorMessage?: string | undefined
}

export type AttrValue = string | number | boolean | unknown[] | Record<string, unknown> | undefined

// One entry per simple `prefix.field` attribute the builder records on a span.
type AttrInput = Record<string, AttrValue>

// ─── Per-run state ──────────────────────────────────────────────────────────

interface RunState {
  /** Trace root span (the `agent`). */
  agent: SpanRecord
  /**
   * Working snapshot of conversation history in the parts-based GenAI shape
   * Latitude's parser expects. Provider-specific shapes from `llm_input` get
   * normalized once on entry; tool_call / tool_call_response parts appended
   * during the run are already in the right shape.
   */
  history: Message[]
  /** Open per-call spans, keyed on the OpenClaw `callId` from `model_call_started`. */
  openModelCalls: Map<string, SpanRecord>
  /** Open tool spans, keyed on `toolCallId`. */
  openToolCalls: Map<string, SpanRecord>
  /** Open compaction span (at most one in flight). */
  openCompaction: SpanRecord | undefined
  /** All closed spans for this run, ready to emit on agent_end. */
  closed: SpanRecord[]
  /** Any subagent spans we OPENED inside this run, keyed by child runId so we
   *  can close them when the child's `subagent_ended` arrives. */
  childSubagentSpans: Map<string, SpanRecord>
}

/**
 * When a parent's `subagent_spawned` fires we register a link from the
 * child's runId → the parent's traceId + the subagent span's id. Then when the
 * child's `before_agent_start` fires, we use those values so the child's
 * entire span subtree lands inside the parent's trace. Outlives the parent's
 * RunState because the child's `agent_end` may arrive after the parent's.
 *
 * `createdAt` is used by the `evictStaleSubagentLinks` sweep to drop entries
 * whose child runs never reached `agent_end` (gateway crash mid-spawn,
 * plugin reload, etc.). Without the sweep the map grows unbounded over the
 * lifetime of a long-running OpenClaw process.
 */
interface SubagentLink {
  traceId: string
  /** Span id of the parent's `subagent` span — used as parentSpanId for the child's root. */
  subagentSpanId: string
  createdAt: number
}

const SUBAGENT_LINK_TTL_MS = 60 * 60 * 1000 // 1 hour
const SUBAGENT_LINK_MAX = 1000

export interface BuildResult {
  /** Run id this batch belongs to. */
  runId: string
  /** All spans ready to be exported (agent + everything beneath it). */
  spans: SpanRecord[]
}

// ─── Builder ────────────────────────────────────────────────────────────────

export class SpanBuilder {
  private readonly runs = new Map<string, RunState>()
  private readonly subagentLinks = new Map<string, SubagentLink>()

  inflightCount(): number {
    return this.runs.size
  }

  /**
   * Open the root `agent` span. If the runId was previously registered as a
   * subagent's child, propagate the parent's traceId and parent the new span
   * under the parent's `subagent` span — so the entire subagent's work nests
   * inside the parent's trace as one waterfall.
   */
  onBeforeAgentStart(evt: OpenClawBeforeAgentStartEvent, ctx: OpenClawAgentContext): void {
    const runId = ctx.runId
    if (!runId) return
    if (this.runs.has(runId)) return // defensive — already open

    const link = this.subagentLinks.get(runId)
    const traceId = link?.traceId ?? hashHex(runId, 32)
    const parentSpanId = link?.subagentSpanId ?? ""

    const agent: SpanRecord = {
      spanId: hashHex(`${traceId}:${runId}:agent`, 16),
      traceId,
      parentSpanId,
      name: "agent",
      startMs: Date.now(),
      endMs: undefined,
      attrs: {
        ...flattenCtx(ctx),
        ...latitudeAttrs(ctx),
        "openclaw.run.id": runId,
        // before_agent_start payload — gated content fields go via `gated.*`
        // attribute keys so the OTLP layer can scrub them without a parallel
        // boolean check. Messages get normalized to parts-shape; `prompt` is
        // a plain string (for the user-prompt convenience attribute).
        "before_agent_start.prompt:gated": evt.prompt,
        "before_agent_start.messages:gated": evt.messages ? normalizeMessages(evt.messages) : undefined,
      },
    }

    this.runs.set(runId, {
      agent,
      history: [],
      openModelCalls: new Map(),
      openToolCalls: new Map(),
      openCompaction: undefined,
      closed: [],
      childSubagentSpans: new Map(),
    })
  }

  /**
   * Enrich the open `agent` span with content + identity from the LLM input.
   * Also seeds the rolling history snapshot used by per-call `model_call`
   * input attributes.
   *
   * Provider-specific message shapes get normalized into the parts-based
   * GenAI format here — that's the contract Latitude's downstream parser
   * expects on `gen_ai.input.messages` and `gen_ai.system_instructions`.
   */
  onLlmInput(evt: OpenClawLlmInputEvent, ctx: OpenClawAgentContext): void {
    const run = this.runs.get(ctx.runId ?? evt.runId)
    if (!run) return

    const normalizedHistory = normalizeMessages(evt.historyMessages)
    const inputMessages: Message[] = [...normalizedHistory]
    if (evt.prompt) inputMessages.push(userMessageFromPrompt(evt.prompt))

    Object.assign(run.agent.attrs, {
      "gen_ai.system_instructions:gated": evt.systemPrompt ? systemInstructionsParts(evt.systemPrompt) : undefined,
      "user_prompt:gated": evt.prompt,
      "gen_ai.input.messages:gated": inputMessages,
      "openclaw.images.count": evt.imagesCount,
      "gen_ai.request.model": evt.model,
      "gen_ai.system": evt.provider,
      "openclaw.provider": evt.provider,
    })
    // Seed the rolling history with the normalized form. The per-call
    // model_call_started will copy the snapshot at the time it fires;
    // subsequent before_tool_call / after_tool_call events append to the
    // same array (already in parts shape) so the next model_call captures
    // the post-tool state.
    run.history = inputMessages
  }

  /**
   * Enrich the agent span with attempt-aggregate output + token usage.
   * (Per-call usage isn't surfaced by OpenClaw today — see PR #2986.)
   */
  onLlmOutput(evt: OpenClawLlmOutputEvent, ctx: OpenClawAgentContext): void {
    const run = this.runs.get(ctx.runId ?? evt.runId)
    if (!run) return
    const assistantMessage = assistantMessageFromOutput(evt.assistantTexts, evt.lastAssistant)
    Object.assign(run.agent.attrs, {
      "gen_ai.output.messages:gated": [assistantMessage],
      "openclaw.resolved.ref": evt.resolvedRef,
      "openclaw.harness.id": evt.harnessId,
      "gen_ai.response.model": evt.model,
      ...usageAttrs(evt.usage),
    })
  }

  onModelCallStarted(evt: OpenClawModelCallStartedEvent, ctx: OpenClawAgentContext): void {
    const run = this.runs.get(evt.runId)
    if (!run) return
    const span: SpanRecord = {
      spanId: hashHex(`${run.agent.traceId}:model_call:${evt.callId}`, 16),
      traceId: run.agent.traceId,
      parentSpanId: run.agent.spanId,
      name: "model_call",
      startMs: Date.now(),
      endMs: undefined,
      attrs: {
        ...latitudeAttrs(ctx),
        "openclaw.run.id": evt.runId,
        "openclaw.call.id": evt.callId,
        "gen_ai.system": evt.provider,
        "openclaw.provider": evt.provider,
        "gen_ai.request.model": evt.model,
        "openclaw.api": evt.api,
        "openclaw.transport": evt.transport,
        // Snapshot the rolling history at the moment this generation starts.
        // The model saw exactly this state. Gated.
        "gen_ai.input.messages:gated": [...run.history],
      },
    }
    run.openModelCalls.set(evt.callId, span)
  }

  onModelCallEnded(evt: OpenClawModelCallEndedEvent, _ctx: OpenClawAgentContext): void {
    const run = this.runs.get(evt.runId)
    if (!run) return
    const span = run.openModelCalls.get(evt.callId)
    if (!span) return
    span.endMs = Date.now()
    span.outcome = evt.outcome === "completed" ? "ok" : "error"
    span.errorMessage = evt.errorCategory
    Object.assign(span.attrs, {
      "openclaw.duration_ms": evt.durationMs,
      "openclaw.outcome": evt.outcome,
      "openclaw.error.category": evt.errorCategory,
      "openclaw.failure.kind": evt.failureKind,
      "openclaw.request.payload_bytes": evt.requestPayloadBytes,
      "openclaw.response.stream_bytes": evt.responseStreamBytes,
      "openclaw.ttfb_ms": evt.timeToFirstByteMs,
      "openclaw.upstream.request_id_hash": evt.upstreamRequestIdHash,
    })
    run.openModelCalls.delete(evt.callId)
    run.closed.push(span)
  }

  /**
   * Open a `tool_call` span as a sibling of the agent span. Also append a
   * synthetic assistant `tool_call` part to the rolling history so the NEXT
   * model_call's input snapshot reflects what the model emitted.
   *
   * IMPORTANT: this runs as a `runModifyingHook` in OpenClaw — returning
   * anything other than `undefined`/falsy from this handler blocks the tool.
   * The plugin-side handler enforces a void return; this method's signature
   * already returns `void`.
   */
  onBeforeToolCall(evt: OpenClawBeforeToolCallEvent, ctx: OpenClawAgentContext): void {
    if (!evt.runId) return
    const run = this.runs.get(evt.runId)
    if (!run) return

    const toolCallId = evt.toolCallId ?? `${evt.toolName}:${randomUUID()}`
    const span: SpanRecord = {
      spanId: hashHex(`${run.agent.traceId}:tool_call:${toolCallId}`, 16),
      traceId: run.agent.traceId,
      parentSpanId: run.agent.spanId,
      name: `tool_call:${evt.toolName}`,
      startMs: Date.now(),
      endMs: undefined,
      attrs: {
        ...latitudeAttrs(ctx),
        "openclaw.run.id": evt.runId,
        "gen_ai.tool.name": evt.toolName,
        "gen_ai.tool.call.id": toolCallId,
        "gen_ai.tool.call.arguments:gated": evt.params,
      },
    }
    run.openToolCalls.set(toolCallId, span)

    // Append an assistant tool_call part to the rolling history so the next
    // model_call captures it.
    run.history.push({
      role: "assistant",
      parts: [{ type: "tool_call", id: toolCallId, name: evt.toolName, arguments: evt.params }],
    })
  }

  onAfterToolCall(evt: OpenClawAfterToolCallEvent, _ctx: OpenClawAgentContext): void {
    if (!evt.runId) return
    const run = this.runs.get(evt.runId)
    if (!run) return

    // Match priority:
    //   1. Direct id lookup — the happy path.
    //   2. Name-match fallback — if `evt.toolCallId` is missing OR refers to
    //      an id we didn't open (e.g. before_tool_call elided it and we
    //      synthesised one, then after_tool_call provided the real one).
    //
    // Without the id-mismatch fallback, the open span would never close
    // and would get force-closed as `abandoned` at agent_end.
    let resolvedId: string | undefined =
      evt.toolCallId && run.openToolCalls.has(evt.toolCallId) ? evt.toolCallId : undefined
    if (!resolvedId) resolvedId = this.findOpenToolCallByName(run, evt.toolName)
    if (!resolvedId) return
    const span = run.openToolCalls.get(resolvedId)
    if (!span) return
    const toolCallId: string = resolvedId

    span.endMs = Date.now()
    const isError = Boolean(evt.error)
    span.outcome = isError ? "error" : "ok"
    span.errorMessage = evt.error
    Object.assign(span.attrs, {
      "gen_ai.tool.call.result:gated": evt.result,
      "openclaw.error.message:gated": evt.error,
      "openclaw.duration_ms": evt.durationMs,
    })
    run.openToolCalls.delete(toolCallId)
    run.closed.push(span)

    // Append the tool response to the rolling history so the next
    // model_call's input snapshot includes it.
    run.history.push({
      role: "tool",
      parts: [{ type: "tool_call_response", id: toolCallId, response: evt.result ?? evt.error ?? "" }],
    })
  }

  onBeforeCompaction(evt: OpenClawBeforeCompactionEvent, ctx: OpenClawAgentContext): void {
    const runId = ctx.runId
    if (!runId) return
    const run = this.runs.get(runId)
    if (!run) return
    const span: SpanRecord = {
      spanId: hashHex(`${run.agent.traceId}:compaction:${run.closed.length}`, 16),
      traceId: run.agent.traceId,
      parentSpanId: run.agent.spanId,
      name: "compaction",
      startMs: Date.now(),
      endMs: undefined,
      attrs: {
        ...latitudeAttrs(ctx),
        "openclaw.run.id": runId,
        "openclaw.compaction.message_count.before": evt.messageCount,
        "openclaw.compaction.session_file": evt.sessionFile,
        "before_compaction.messages:gated": evt.messages ? normalizeMessages(evt.messages) : undefined,
      },
    }
    run.openCompaction = span
  }

  onAfterCompaction(evt: OpenClawAfterCompactionEvent, ctx: OpenClawAgentContext): void {
    const runId = ctx.runId
    if (!runId) return
    const run = this.runs.get(runId)
    if (!run?.openCompaction) return
    const span = run.openCompaction
    span.endMs = Date.now()
    span.outcome = "ok"
    Object.assign(span.attrs, {
      "openclaw.compaction.message_count.after": evt.messageCount,
      "openclaw.compaction.compacted_count": evt.compactedCount,
      "openclaw.compaction.token_count": evt.tokenCount,
    })
    run.openCompaction = undefined
    run.closed.push(span)
  }

  /**
   * Open a `subagent` span on the parent run AND register the cross-run link
   * so the child's `before_agent_start` can find us.
   */
  onSubagentSpawned(evt: OpenClawSubagentSpawnedEvent, ctx: OpenClawAgentContext): void {
    const parentRunId = ctx.runId
    if (!parentRunId) return
    const parent = this.runs.get(parentRunId)
    if (!parent) return

    const span: SpanRecord = {
      spanId: hashHex(`${parent.agent.traceId}:subagent:${evt.runId}`, 16),
      traceId: parent.agent.traceId,
      parentSpanId: parent.agent.spanId,
      name: "subagent",
      startMs: Date.now(),
      endMs: undefined,
      attrs: {
        // The subagent span lives inside the parent's trace — tags +
        // metadata reflect the parent's ctx (which agent/channel/trigger
        // is doing the spawning), not the child's. The child's `agent` span
        // (opened later by the child run's before_agent_start) carries
        // its OWN ctx.
        ...latitudeAttrs(ctx),
        "openclaw.parent.run.id": parentRunId,
        "openclaw.run.id": evt.runId,
        "openclaw.subagent.child_session_key": evt.childSessionKey,
        "openclaw.subagent.agent_id": evt.agentId,
        "openclaw.subagent.label": evt.label,
        "openclaw.subagent.mode": evt.mode,
        "openclaw.subagent.thread_requested": evt.threadRequested,
        "openclaw.subagent.requester.channel": evt.requester?.channel,
        "openclaw.subagent.requester.account_id": evt.requester?.accountId,
        "openclaw.subagent.requester.to": evt.requester?.to,
        "openclaw.subagent.requester.thread_id":
          typeof evt.requester?.threadId === "string" || typeof evt.requester?.threadId === "number"
            ? String(evt.requester.threadId)
            : undefined,
      },
    }
    parent.childSubagentSpans.set(evt.runId, span)
    this.evictStaleSubagentLinks()
    this.subagentLinks.set(evt.runId, {
      traceId: parent.agent.traceId,
      subagentSpanId: span.spanId,
      createdAt: Date.now(),
    })
  }

  onSubagentEnded(evt: OpenClawSubagentEndedEvent, ctx: OpenClawAgentContext): void {
    const parentRunId = ctx.runId
    if (!parentRunId) return
    const parent = this.runs.get(parentRunId)
    if (!parent) return
    const childRunId = evt.runId
    if (!childRunId) return
    const span = parent.childSubagentSpans.get(childRunId)
    if (!span) return

    span.endMs = Date.now()
    const isError = evt.outcome === "error" || Boolean(evt.error)
    span.outcome = isError ? "error" : "ok"
    span.errorMessage = evt.error
    Object.assign(span.attrs, {
      "openclaw.subagent.target_session_key": evt.targetSessionKey,
      "openclaw.subagent.target_kind": evt.targetKind,
      "openclaw.subagent.reason": evt.reason,
      "openclaw.subagent.outcome": evt.outcome,
      "openclaw.subagent.send_farewell": evt.sendFarewell,
      "openclaw.subagent.account_id": evt.accountId,
    })
    parent.childSubagentSpans.delete(childRunId)
    parent.closed.push(span)
    // Don't delete the subagent link yet — the child's `agent_end` may still
    // be in flight. We clean it up when the child's agent_end fires.
  }

  /**
   * Close out the run: finish the agent span, abandon any still-open
   * model_calls / tool_calls / compactions, and return everything ready to
   * emit. Removes the subagent link if this was a child run.
   */
  onAgentEnd(evt: OpenClawAgentEndEvent, ctx: OpenClawAgentContext): BuildResult | undefined {
    const runId = ctx.runId
    if (!runId) return undefined
    const run = this.runs.get(runId)
    if (!run) {
      // Child agent run that closed without ever opening — drop the link
      // entry so the map doesn't grow unbounded.
      this.subagentLinks.delete(runId)
      return undefined
    }

    const now = Date.now()
    run.agent.endMs = now
    run.agent.outcome = evt.success ? "ok" : "error"
    run.agent.errorMessage = evt.error
    Object.assign(run.agent.attrs, {
      "openclaw.duration_ms": evt.durationMs,
      "openclaw.run.success": evt.success,
      "openclaw.error.message:gated": evt.error,
      "agent_end.messages:gated": normalizeMessages(evt.messages),
    })

    // Anything still open at agent_end didn't get a proper close event.
    // Mark them abandoned and force-close so they show up in the trace
    // rather than vanish silently.
    for (const span of run.openModelCalls.values()) {
      span.endMs = now
      span.outcome = "error"
      span.attrs["openclaw.outcome"] = "abandoned"
      run.closed.push(span)
    }
    for (const span of run.openToolCalls.values()) {
      span.endMs = now
      span.outcome = "error"
      span.attrs["openclaw.outcome"] = "abandoned"
      run.closed.push(span)
    }
    if (run.openCompaction) {
      run.openCompaction.endMs = now
      run.openCompaction.outcome = "error"
      run.openCompaction.attrs["openclaw.outcome"] = "abandoned"
      run.closed.push(run.openCompaction)
    }
    for (const span of run.childSubagentSpans.values()) {
      span.endMs = now
      span.outcome = "error"
      span.attrs["openclaw.subagent.outcome"] = "abandoned"
      run.closed.push(span)
    }

    const spans = [run.agent, ...run.closed]
    this.runs.delete(runId)
    this.subagentLinks.delete(runId)
    return { runId, spans }
  }

  /** Drop a run without emitting — used on errors from the emit path. */
  abandon(runId: string): void {
    this.runs.delete(runId)
    this.subagentLinks.delete(runId)
  }

  /** Test-only: how many cross-run subagent links we're holding. */
  subagentLinkCount(): number {
    return this.subagentLinks.size
  }

  /**
   * Drop any subagent links whose child run never reached `agent_end`. Called
   * before every `subagent_spawned` insert so the map stays bounded even when
   * children crash mid-spawn or the plugin reloads.
   *
   * Two passes: TTL eviction (anything older than `SUBAGENT_LINK_TTL_MS`),
   * then a hard size cap (when we're past `SUBAGENT_LINK_MAX`, drop the
   * oldest until we're under).
   */
  private evictStaleSubagentLinks(): void {
    const now = Date.now()
    for (const [runId, link] of this.subagentLinks) {
      if (now - link.createdAt > SUBAGENT_LINK_TTL_MS) {
        this.subagentLinks.delete(runId)
      }
    }
    if (this.subagentLinks.size <= SUBAGENT_LINK_MAX) return
    const sorted = Array.from(this.subagentLinks.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt)
    const toRemove = this.subagentLinks.size - SUBAGENT_LINK_MAX
    for (let i = 0; i < toRemove; i++) {
      const entry = sorted[i]
      if (entry) this.subagentLinks.delete(entry[0])
    }
  }

  private findOpenToolCallByName(run: RunState, toolName: string): string | undefined {
    // Defensive: OpenClaw versions that elide toolCallId on after_tool_call
    // can be matched by name + still-open status. When multiple in-flight
    // tool calls share a name, prefer the MOST RECENTLY opened — Maps
    // preserve insertion order, so iterating in reverse picks the latest.
    // (LIFO matches typical agent runtimes that issue tools sequentially.)
    const target = `tool_call:${toolName}`
    const entries = Array.from(run.openToolCalls.entries())
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]
      if (!entry) continue
      const [id, span] = entry
      if (span.name === target) return id
    }
    return undefined
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function flattenCtx(ctx: OpenClawAgentContext): AttrInput {
  return {
    "openclaw.run.id": ctx.runId,
    "openclaw.session.id": ctx.sessionId,
    "openclaw.session.key": ctx.sessionKey,
    "openclaw.agent.id": ctx.agentId,
    "openclaw.agent.name": ctx.agentId,
    "openclaw.workspace.dir": ctx.workspaceDir,
    "openclaw.message.provider": ctx.messageProvider,
    "openclaw.trigger": ctx.trigger,
    "openclaw.channel.id": ctx.channelId,
    "openclaw.cron.job.id": ctx.jobId,
    "openclaw.model.provider.id": ctx.modelProviderId,
    "openclaw.model.id": ctx.modelId,
  }
}

/**
 * Build `latitude.tags` and `latitude.metadata` attrs from the hook context.
 * The OTLP encoder JSON-stringifies arrays/objects, which is the encoding
 * Latitude's resolver expects:
 *
 *   - `latitude.tags` is a JSON-encoded string array (`fromJsonStringArray`
 *     in domain/spans/src/otlp/resolvers/enrichment.ts).
 *   - `latitude.metadata` is a JSON-encoded string object (`fromJsonString`).
 *
 * Tags = the agent id, the channel id, and the trigger. When trigger is
 * `cron`, the tag becomes `cron:<jobId>` so dashboards can pivot on the
 * specific cron job. Each tag is conditionally included so absent ctx
 * fields don't produce empty entries.
 *
 * Metadata = every ctx field that's set, namespaced under `openclaw.*` so
 * it can't collide with metadata keys other plugins might emit.
 */
function latitudeAttrs(ctx: OpenClawAgentContext): AttrInput {
  const tags: string[] = []
  if (ctx.agentId) tags.push(ctx.agentId)
  if (ctx.channelId) tags.push(ctx.channelId)
  if (ctx.trigger) {
    tags.push(ctx.trigger === "cron" && ctx.jobId ? `cron:${ctx.jobId}` : ctx.trigger)
  }

  const metadata: Record<string, string> = {}
  if (ctx.runId) metadata["openclaw.run.id"] = ctx.runId
  if (ctx.sessionId) metadata["openclaw.session.id"] = ctx.sessionId
  if (ctx.sessionKey) metadata["openclaw.session.key"] = ctx.sessionKey
  if (ctx.agentId) metadata["openclaw.agent.id"] = ctx.agentId
  if (ctx.workspaceDir) metadata["openclaw.workspace.dir"] = ctx.workspaceDir
  if (ctx.channelId) metadata["openclaw.channel.id"] = ctx.channelId
  if (ctx.messageProvider) metadata["openclaw.message.provider"] = ctx.messageProvider
  if (ctx.trigger) metadata["openclaw.trigger"] = ctx.trigger
  if (ctx.jobId) metadata["openclaw.cron.job.id"] = ctx.jobId
  if (ctx.modelProviderId) metadata["openclaw.model.provider.id"] = ctx.modelProviderId
  if (ctx.modelId) metadata["openclaw.model.id"] = ctx.modelId

  return {
    "latitude.tags": tags.length > 0 ? tags : undefined,
    "latitude.metadata": Object.keys(metadata).length > 0 ? metadata : undefined,
  }
}

function usageAttrs(usage: OpenClawLlmUsage | undefined): AttrInput {
  if (!usage) return {}
  return {
    "gen_ai.usage.input_tokens": usage.input,
    "gen_ai.usage.output_tokens": usage.output,
    "gen_ai.usage.cache_read_input_tokens": usage.cacheRead,
    "gen_ai.usage.cache_creation_input_tokens": usage.cacheWrite,
    "gen_ai.usage.total_tokens": usage.total,
  }
}

function hashHex(input: string, length: number): string {
  return createHash("sha256").update(input).digest("hex").slice(0, length)
}
