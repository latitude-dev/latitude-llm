import { type Config, loadConfig } from "./config.ts"
import { createLogger, type HostLogger, type Logger } from "./logger.ts"
import { buildOtlpRequest, SCOPE_VERSION } from "./otlp.ts"
import { type BuildResult, SpanBuilder } from "./span-builder.ts"
import { Transport } from "./transport.ts"
import type {
  OpenClawAfterCompactionEvent,
  OpenClawAfterToolCallEvent,
  OpenClawAgentContext,
  OpenClawAgentEndEvent,
  OpenClawBeforeCompactionEvent,
  OpenClawBeforeToolCallEvent,
  OpenClawCronChangedEvent,
  OpenClawLlmInputEvent,
  OpenClawLlmOutputEvent,
  OpenClawMessageContext,
  OpenClawMessageReceivedEvent,
  OpenClawModelCallEndedEvent,
  OpenClawModelCallStartedEvent,
  OpenClawSessionEndEvent,
  OpenClawSessionScopedContext,
  OpenClawSessionStartEvent,
  OpenClawSubagentContext,
  OpenClawSubagentEndedEvent,
  OpenClawSubagentSpawnedEvent,
  OpenClawToolContext,
} from "./types.ts"

/**
 * Structural type for the slice of OpenClaw's plugin API this plugin touches.
 * Kept local so the package works without OpenClaw installed (tests, CLI) and
 * tolerates small upstream signature changes.
 */
export interface OpenClawPluginApiLike {
  logger?: HostLogger
  pluginConfig?: Record<string, unknown>
  /** The whole OpenClaw config; only the plugin's own `hooks` block is read. */
  config?: { plugins?: { entries?: Record<string, { hooks?: { allowConversationAccess?: boolean } }> } }
  /** Host runtime helpers; the state dir and the agent event stream are used when present. */
  runtime?: {
    state?: { resolveStateDir?: () => string }
    events?: { onAgentEvent?: (listener: (evt: AgentEventLike) => void) => unknown }
  }
  on: <K extends string>(
    hookName: K,
    handler: (event: unknown, ctx: unknown) => unknown,
    opts?: { priority?: number },
  ) => void
}

export interface AgentEventLike {
  runId?: string
  stream?: string
  ts?: number
  data?: Record<string, unknown>
  sessionKey?: string
  sessionId?: string
  agentId?: string
}

export interface RegisterOptions {
  /** Override the config, mostly for tests. */
  config?: Config
  logger?: Logger
  /** Observe each finished batch right before export. Tests only. */
  onEmit?: (result: BuildResult) => void
  /** Replace the network transport. Tests only. */
  transport?: Pick<Transport, "enqueue" | "flush">
  now?: () => number
  schedule?: (fn: () => void, ms: number) => () => void
}

const STOP_FLUSH_BUDGET_MS = 4_000
const PLUGIN_ID = "@latitude-data/openclaw-telemetry"

export default function registerLatitudePlugin(api: OpenClawPluginApiLike, opts: RegisterOptions = {}): void {
  const config = opts.config ?? loadConfig(api.pluginConfig)
  const logger = opts.logger ?? createLogger(config.debug, api.logger)

  if (!config.enabled) {
    if (config.apiKey === "") logger.warn("disabled: apiKey is empty (set plugins.entries[id].config.apiKey)")
    if (config.project === "") logger.warn("disabled: project is empty (set plugins.entries[id].config.project)")
    return
  }
  logger.debug(
    `enabled v${SCOPE_VERSION}: project=${config.project} base=${config.baseUrl} content=${config.allowConversationAccess}`,
  )
  if (api.config?.plugins?.entries && api.config.plugins.entries[PLUGIN_ID]?.hooks?.allowConversationAccess !== true) {
    logger.warn(
      `plugins.entries["${PLUGIN_ID}"].hooks.allowConversationAccess is not true; OpenClaw will not deliver the conversation hooks and no traces will be exported. ` +
        `Run: openclaw config set 'plugins.entries["${PLUGIN_ID}"].hooks.allowConversationAccess' true && openclaw gateway restart`,
    )
  }

  const transport =
    opts.transport ?? new Transport({ baseUrl: config.baseUrl, apiKey: config.apiKey, project: config.project, logger })

  let stateDir: string | undefined
  try {
    stateDir = api.runtime?.state?.resolveStateDir?.()
  } catch {
    stateDir = undefined
  }

  const builder = new SpanBuilder({
    pluginVersion: SCOPE_VERSION,
    stateDir,
    tags: config.tags,
    metadata: config.metadata,
    memory: config.memory,
    memoryContent: config.memoryContent,
    toolDefinitions: config.toolDefinitions,
    now: opts.now,
    schedule: opts.schedule,
    log: (msg) => logger.debug(msg),
    emit: (result) => {
      try {
        opts.onEmit?.(result)
        logger.debug(`run ${result.runId}: ${result.spans.length} spans ready`)
        transport.enqueue(
          buildOtlpRequest([result], {
            allowConversationAccess: config.allowConversationAccess,
            redact: config.redact,
            serviceName: config.serviceName,
            maxContentChars: config.maxContentChars,
          }),
        )
      } catch (err) {
        logger.warn(`export of run ${result.runId} failed: ${String(err)}`)
      }
    },
  })

  const wrap = <E, C>(name: string, fn: (evt: E, ctx: C) => void): ((evt: unknown, ctx: unknown) => undefined) => {
    return (evt, ctx) => {
      try {
        fn(evt as E, ctx as C)
      } catch (err) {
        logger.warn(`${name} handler failed: ${String(err)}`)
      }
      // Several of these are modifying hooks; anything but undefined would alter the run.
      return undefined
    }
  }

  api.on(
    "llm_input",
    wrap<OpenClawLlmInputEvent, OpenClawAgentContext>("llm_input", (e, c) => builder.onLlmInput(e, c)),
  )
  api.on(
    "llm_output",
    wrap<OpenClawLlmOutputEvent, OpenClawAgentContext>("llm_output", (e, c) => builder.onLlmOutput(e, c)),
  )
  api.on(
    "agent_end",
    wrap<OpenClawAgentEndEvent, OpenClawAgentContext>("agent_end", (e, c) => builder.onAgentEnd(e, c)),
  )

  api.on(
    "model_call_started",
    wrap<OpenClawModelCallStartedEvent, OpenClawAgentContext>("model_call_started", (e, c) =>
      builder.onModelCallStarted(e, c),
    ),
  )
  api.on(
    "model_call_ended",
    wrap<OpenClawModelCallEndedEvent, OpenClawAgentContext>("model_call_ended", (e, c) =>
      builder.onModelCallEnded(e, c),
    ),
  )

  api.on(
    "before_tool_call",
    wrap<OpenClawBeforeToolCallEvent, OpenClawToolContext>("before_tool_call", (e, c) =>
      builder.onBeforeToolCall(e, c),
    ),
  )
  api.on(
    "after_tool_call",
    wrap<OpenClawAfterToolCallEvent, OpenClawToolContext>("after_tool_call", (e, c) => builder.onAfterToolCall(e, c)),
  )

  api.on(
    "before_compaction",
    wrap<OpenClawBeforeCompactionEvent, OpenClawSessionScopedContext>("before_compaction", (e, c) =>
      builder.onBeforeCompaction(e, c),
    ),
  )
  api.on(
    "after_compaction",
    wrap<OpenClawAfterCompactionEvent, OpenClawSessionScopedContext>("after_compaction", (e, c) =>
      builder.onAfterCompaction(e, c),
    ),
  )

  api.on(
    "subagent_spawned",
    wrap<OpenClawSubagentSpawnedEvent, OpenClawSubagentContext>("subagent_spawned", (e, c) =>
      builder.onSubagentSpawned(e, c),
    ),
  )
  api.on(
    "subagent_ended",
    wrap<OpenClawSubagentEndedEvent, OpenClawSubagentContext>("subagent_ended", (e, c) =>
      builder.onSubagentEnded(e, c),
    ),
  )

  api.on(
    "session_start",
    wrap<OpenClawSessionStartEvent, OpenClawSessionScopedContext>("session_start", (e, c) =>
      builder.onSessionStart(e, c),
    ),
  )
  api.on(
    "session_end",
    wrap<OpenClawSessionEndEvent, OpenClawSessionScopedContext>("session_end", (e, c) =>
      builder.onSessionEnd(e.sessionKey ?? c.sessionKey, e.sessionId ?? c.sessionId),
    ),
  )
  api.on(
    "message_received",
    wrap<OpenClawMessageReceivedEvent, OpenClawMessageContext>("message_received", (e, c) =>
      builder.onMessageReceived(e, c),
    ),
  )
  api.on(
    "cron_changed",
    wrap<OpenClawCronChangedEvent, unknown>("cron_changed", (e) => builder.onCronChanged(e)),
  )

  api.on("gateway_stop", (_evt, _ctx) => transport.flush(STOP_FLUSH_BUDGET_MS))

  // Streamed deltas are the only time-to-first-token source on the Codex harness.
  try {
    api.runtime?.events?.onAgentEvent?.((evt) => {
      try {
        builder.onAgentEvent(evt)
      } catch (err) {
        logger.warn(`agent event handler failed: ${String(err)}`)
      }
    })
  } catch (err) {
    logger.debug(`agent event stream unavailable: ${String(err)}`)
  }
}
