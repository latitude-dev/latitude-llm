import { postTraces } from "./client.ts"
import { loadConfig, resolveIdentity } from "./config.ts"
import { createLogger } from "./logger.ts"
import { buildOtlpRequest } from "./otlp.ts"
import { PiSpanBuilder } from "./span-builder.ts"
import type { PiExtensionAPI } from "./types.ts"

export default function latitudePiTelemetry(pi: PiExtensionAPI): void {
  let config = loadConfig()
  let identity = resolveIdentity()
  let logger = createLogger(config.debug)
  let builder = new PiSpanBuilder(config, identity)

  pi.on("session_start", async (_event, ctx) => {
    config = loadConfig()
    identity = resolveIdentity()
    logger = createLogger(config.debug)
    builder = new PiSpanBuilder(config, identity)

    if (!config.enabled) {
      if (config.debug && ctx.hasUI && ctx.ui?.setStatus) ctx.ui.setStatus("latitude", "Latitude off")
      logger.debug(`disabled (source=${config.configSource})`)
      return
    }

    if (ctx.hasUI && ctx.ui?.setStatus) {
      const label = ctx.ui.theme?.fg?.("dim", "Latitude") ?? "Latitude"
      ctx.ui.setStatus("latitude", label)
    }
    logger.debug(`enabled (project=${config.project}, source=${config.configSource})`)
  })

  pi.on("session_shutdown", async () => {
    builder.reset()
  })

  pi.on("before_agent_start", async (event, ctx) => {
    if (!config.enabled) return
    builder.onBeforeAgentStart(event, ctx)
  })

  pi.on("turn_start", async (event, ctx) => {
    if (!config.enabled) return
    builder.onTurnStart(event, ctx)
  })

  pi.on("context", async (event) => {
    if (!config.enabled) return
    builder.onContext(event)
  })

  pi.on("before_provider_request", async (event) => {
    if (!config.enabled) return
    builder.onBeforeProviderRequest(event)
  })

  pi.on("message_end", async (event) => {
    if (!config.enabled) return
    builder.onMessageEnd(event)
  })

  pi.on("turn_end", async (event) => {
    if (!config.enabled) return
    builder.onTurnEnd(event)
  })

  pi.on("tool_execution_start", async (event, ctx) => {
    if (!config.enabled) return
    builder.onToolExecutionStart(event, ctx)
  })

  pi.on("tool_execution_end", async (event) => {
    if (!config.enabled) return
    builder.onToolExecutionEnd(event)
  })

  pi.on("session_compact", async (event) => {
    if (!config.enabled) return
    builder.onSessionCompact(event)
  })

  pi.on("agent_end", async (event, ctx) => {
    if (!config.enabled) return
    const result = builder.onAgentEnd(event, ctx)
    if (!result || result.spans.length === 0) return

    const payload = buildOtlpRequest(result, {
      allowConversationAccess: config.allowConversationAccess,
      identity,
    })

    const exportPromise = postTraces({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      project: config.project,
      payload,
      logger,
    })

    if (ctx.hasUI) {
      void exportPromise
    } else {
      await exportPromise
    }
  })
}
