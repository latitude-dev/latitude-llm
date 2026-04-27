import { postTraces } from "./client.ts"
import { type Config, loadConfig } from "./config.ts"
import { createLogger, type Logger } from "./logger.ts"
import { buildOtlpRequest } from "./otlp.ts"
import { TurnBuilder } from "./turn-builder.ts"
import type {
  OpenClawAfterToolCallEvent,
  OpenClawAgentContext,
  OpenClawAgentEndEvent,
  OpenClawBeforeToolCallEvent,
  OpenClawLlmInputEvent,
  OpenClawLlmOutputEvent,
  OpenClawSessionStartEvent,
  RunRecord,
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
  onEmit?: (run: RunRecord) => void
}

/**
 * Register the Latitude plugin against an OpenClaw plugin API. OpenClaw calls
 * this once at plugin activation; we wire up `llm_input`, `llm_output`, tool
 * and lifecycle hooks to stream traces to Latitude.
 *
 * Every handler is fire-and-forget on OpenClaw's side (see
 * `src/plugins/hooks.ts` — runLlmInput/runLlmOutput are documented as
 * parallel and wrapped with `.catch()` at the call site in attempt.ts), so
 * nothing we do here can slow the agent loop.
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

  const builder = new TurnBuilder()

  api.on("session_start", (evt, ctx) => {
    builder.onSessionStart(evt as OpenClawSessionStartEvent, ctx as OpenClawAgentContext)
  })

  api.on("llm_input", (evt, ctx) => {
    try {
      builder.onLlmInput(evt as OpenClawLlmInputEvent, ctx as OpenClawAgentContext)
    } catch (err) {
      logger.warn(`llm_input handler failed: ${String(err)}`)
    }
  })

  api.on("before_tool_call", (evt, ctx) => {
    try {
      builder.onBeforeToolCall(evt as OpenClawBeforeToolCallEvent, ctx as OpenClawAgentContext)
    } catch (err) {
      logger.warn(`before_tool_call handler failed: ${String(err)}`)
    }
  })

  api.on("after_tool_call", (evt, ctx) => {
    try {
      builder.onAfterToolCall(evt as OpenClawAfterToolCallEvent, ctx as OpenClawAgentContext)
    } catch (err) {
      logger.warn(`after_tool_call handler failed: ${String(err)}`)
    }
  })

  api.on("llm_output", (evt, ctx) => {
    try {
      builder.onLlmOutput(evt as OpenClawLlmOutputEvent, ctx as OpenClawAgentContext)
    } catch (err) {
      logger.warn(`llm_output handler failed: ${String(err)}`)
    }
  })

  api.on("agent_end", (evt, ctx) => {
    try {
      const run = builder.onAgentEnd(evt as OpenClawAgentEndEvent, ctx as OpenClawAgentContext)
      if (!run) {
        logger.debug("agent_end fired without a matching run in flight")
        return
      }
      opts.onEmit?.(run)
      const payload = buildOtlpRequest(run, { allowConversationAccess: config.allowConversationAccess })
      void postTraces({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        project: config.project,
        payload,
        logger,
      })
    } catch (err) {
      logger.warn(`agent_end handler failed: ${String(err)}`)
    }
  })
}
