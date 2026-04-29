import { postTraces } from "./client.ts"
import { type Config, loadConfig } from "./config.ts"
import { createLogger, type Logger } from "./logger.ts"
import { buildOtlpRequest } from "./otlp.ts"
import { type BuildResult, SpanBuilder } from "./span-builder.ts"
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
  OpenClawModelCallEndedEvent,
  OpenClawModelCallStartedEvent,
  OpenClawSubagentEndedEvent,
  OpenClawSubagentSpawnedEvent,
} from "./types.ts"

/**
 * Minimal structural type for OpenClaw's plugin API — only the fields we
 * touch. We avoid importing from `openclaw/plugin-sdk` so the package stays
 * usable when OpenClaw isn't installed (the CLI and tests don't need it),
 * and so we're robust to small signature changes across OpenClaw versions.
 *
 * `pluginConfig` is the user's `plugins.entries[id].config` block — that's
 * the canonical place to read credentials and feature flags. The OpenClaw
 * plugin SDK also exposes the same value as `api.pluginConfig` on the
 * builder API; keep both names in sync if the upstream contract evolves.
 */
export interface OpenClawPluginApiLike {
  logger?: Logger
  pluginConfig?: Record<string, unknown>
  on: <K extends string>(
    hookName: K,
    handler: (event: unknown, ctx: unknown) => unknown,
    opts?: { priority?: number },
  ) => void
}

export interface RegisterOptions {
  /** Override the config, mostly for tests. */
  config?: Config
  /** Override the logger. */
  logger?: Logger
  /**
   * Hook to observe the emitted run right before it's posted. Used by tests;
   * not a stable public API.
   */
  onEmit?: (result: BuildResult) => void
}

/**
 * Register the Latitude plugin against an OpenClaw plugin API. OpenClaw calls
 * this once at plugin activation; we wire up the granular paired hooks
 * (model_call_started/_ended, before_/after_tool_call, before_/after_compaction,
 * subagent_spawned/_ended, before_agent_start/agent_end) plus the
 * data-only feeds (llm_input/llm_output) that enrich the agent span.
 *
 * Every typed hook on OpenClaw's side fires fire-and-forget for non-modifying
 * hooks; before_tool_call is a `runModifyingHook` where returning anything
 * other than undefined blocks the tool call. Our handler returns nothing —
 * keep it that way.
 */
export default function registerLatitudePlugin(api: OpenClawPluginApiLike, opts: RegisterOptions = {}): void {
  // Source of truth: OpenClaw passes the user's `plugins.entries[id].config`
  // as `api.pluginConfig`. Env vars are a fallback so existing deploys with
  // LATITUDE_* exported in the gateway environment keep working.
  const config = opts.config ?? loadConfig(api.pluginConfig)
  const logger = opts.logger ?? createLogger(config.debug)

  if (!config.enabled) {
    if (config.apiKey === "") logger.debug("disabled: apiKey is empty (set plugins.entries[id].config.apiKey)")
    if (config.project === "") logger.debug("disabled: project is empty (set plugins.entries[id].config.project)")
    return
  }
  logger.debug(
    `enabled: project=${config.project} base=${config.baseUrl} allowConversationAccess=${config.allowConversationAccess}`,
  )

  const builder = new SpanBuilder()

  // Helper: wrap a void-returning hook handler with try/catch + cast.
  const wrap = <E>(
    name: string,
    fn: (evt: E, ctx: OpenClawAgentContext) => void,
  ): ((evt: unknown, ctx: unknown) => void) => {
    return (evt, ctx) => {
      try {
        fn(evt as E, ctx as OpenClawAgentContext)
      } catch (err) {
        logger.warn(`${name} handler failed: ${String(err)}`)
      }
    }
  }

  // ─── Span boundaries ────────────────────────────────────────────────────

  api.on(
    "before_agent_start",
    wrap<OpenClawBeforeAgentStartEvent>("before_agent_start", (evt, ctx) => {
      builder.onBeforeAgentStart(evt, ctx)
    }),
  )

  api.on(
    "model_call_started",
    wrap<OpenClawModelCallStartedEvent>("model_call_started", (evt, ctx) => {
      builder.onModelCallStarted(evt, ctx)
    }),
  )
  api.on(
    "model_call_ended",
    wrap<OpenClawModelCallEndedEvent>("model_call_ended", (evt, ctx) => {
      builder.onModelCallEnded(evt, ctx)
    }),
  )

  // before_tool_call is a `runModifyingHook` — returning {block: true} from
  // any plugin handler blocks the tool. We return nothing (void) so OpenClaw
  // dispatches normally. The `wrap` helper preserves that void return.
  api.on(
    "before_tool_call",
    wrap<OpenClawBeforeToolCallEvent>("before_tool_call", (evt, ctx) => {
      builder.onBeforeToolCall(evt, ctx)
    }),
  )
  api.on(
    "after_tool_call",
    wrap<OpenClawAfterToolCallEvent>("after_tool_call", (evt, ctx) => {
      builder.onAfterToolCall(evt, ctx)
    }),
  )

  api.on(
    "before_compaction",
    wrap<OpenClawBeforeCompactionEvent>("before_compaction", (evt, ctx) => {
      builder.onBeforeCompaction(evt, ctx)
    }),
  )
  api.on(
    "after_compaction",
    wrap<OpenClawAfterCompactionEvent>("after_compaction", (evt, ctx) => {
      builder.onAfterCompaction(evt, ctx)
    }),
  )

  api.on(
    "subagent_spawned",
    wrap<OpenClawSubagentSpawnedEvent>("subagent_spawned", (evt, ctx) => {
      builder.onSubagentSpawned(evt, ctx)
    }),
  )
  api.on(
    "subagent_ended",
    wrap<OpenClawSubagentEndedEvent>("subagent_ended", (evt, ctx) => {
      builder.onSubagentEnded(evt, ctx)
    }),
  )

  // ─── Data-only feeds ────────────────────────────────────────────────────
  // These DON'T open or close spans. They enrich the open `agent` span with
  // attempt-aggregate content + token usage, and seed the rolling history
  // snapshot used by per-call `model_call.input.messages`.

  api.on(
    "llm_input",
    wrap<OpenClawLlmInputEvent>("llm_input", (evt, ctx) => {
      builder.onLlmInput(evt, ctx)
    }),
  )
  api.on(
    "llm_output",
    wrap<OpenClawLlmOutputEvent>("llm_output", (evt, ctx) => {
      builder.onLlmOutput(evt, ctx)
    }),
  )

  // ─── Trace flush ────────────────────────────────────────────────────────

  api.on(
    "agent_end",
    wrap<OpenClawAgentEndEvent>("agent_end", (evt, ctx) => {
      const result = builder.onAgentEnd(evt, ctx)
      if (!result) {
        logger.debug("agent_end fired without a matching run in flight")
        return
      }
      opts.onEmit?.(result)
      const payload = buildOtlpRequest(result, { allowConversationAccess: config.allowConversationAccess })
      void postTraces({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        project: config.project,
        payload,
        logger,
      })
    }),
  )
}
