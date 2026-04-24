import type {
  LlmCallRecord,
  OpenClawAfterToolCallEvent,
  OpenClawAgentContext,
  OpenClawAgentEndEvent,
  OpenClawBeforeToolCallEvent,
  OpenClawLlmInputEvent,
  OpenClawLlmOutputEvent,
  OpenClawSessionStartEvent,
  RunRecord,
  ToolCallRecord,
} from "./types.ts"

/**
 * Accumulates OpenClaw hook events per agent run (keyed by `runId`) into a
 * `RunRecord` ready to be converted to OTLP spans. All mutation is synchronous
 * and non-blocking so the hook runner can stay fire-and-forget.
 *
 * Event ordering assumptions (verified against OpenClaw
 * src/agents/pi-embedded-runner/run/attempt.ts):
 *
 *   session_start? -> [ llm_input -> (before_tool_call -> after_tool_call)* -> llm_output ]+ -> agent_end
 *
 * Tool calls arriving between an `llm_input` and its `llm_output` are attached
 * to the currently-open LLM call. Tools arriving outside that window (e.g.
 * `after_tool_call` fires after `llm_output` has already closed the call) are
 * stored on the run's `orphanTools` list so we don't drop them.
 */
export class TurnBuilder {
  private readonly runs = new Map<string, RunRecord>()

  onSessionStart(_evt: OpenClawSessionStartEvent, _ctx: OpenClawAgentContext): void {
    // No-op for now — we lazily create RunRecords on the first `llm_input` for
    // a given runId. Kept as a hook point so we can later emit a
    // session-level span or capture `resumedFrom` metadata.
  }

  onLlmInput(evt: OpenClawLlmInputEvent, ctx: OpenClawAgentContext): LlmCallRecord {
    const run = this.ensureRun(evt.runId, ctx)
    const call: LlmCallRecord = {
      runId: evt.runId,
      sessionId: evt.sessionId,
      sessionKey: ctx.sessionKey,
      agentId: ctx.agentId,
      provider: evt.provider,
      requestModel: evt.model,
      responseModel: undefined,
      resolvedRef: undefined,
      systemPrompt: evt.systemPrompt,
      prompt: evt.prompt,
      historyMessages: evt.historyMessages,
      imagesCount: evt.imagesCount,
      assistantTexts: [],
      lastAssistant: undefined,
      usage: undefined,
      startMs: Date.now(),
      endMs: undefined,
      error: undefined,
      toolCalls: [],
    }
    run.llmCalls.push(call)
    return call
  }

  onBeforeToolCall(evt: OpenClawBeforeToolCallEvent, ctx: OpenClawAgentContext): void {
    if (!evt.runId) return
    // Create the run record lazily if a tool fires before we've seen llm_input
    // for this runId — rare but possible, and we prefer capturing an orphan
    // tool over dropping the event.
    const run = this.runs.get(evt.runId) ?? this.ensureRun(evt.runId, ctx)

    const tool: ToolCallRecord = {
      toolCallId: evt.toolCallId ?? `${evt.toolName}:${run.llmCalls.length}:${Date.now()}`,
      toolName: evt.toolName,
      params: evt.params,
      result: undefined,
      error: undefined,
      startMs: Date.now(),
      endMs: undefined,
      durationMs: undefined,
      agentId: ctx.agentId,
    }
    const openCall = this.currentOpenCall(run)
    if (openCall) {
      openCall.toolCalls.push(tool)
    } else {
      run.orphanTools.push(tool)
    }
  }

  onAfterToolCall(evt: OpenClawAfterToolCallEvent, _ctx: OpenClawAgentContext): void {
    if (!evt.runId) return
    const run = this.runs.get(evt.runId)
    if (!run) return
    const tool = this.findToolRecord(run, evt.toolCallId, evt.toolName)
    if (!tool) return
    tool.result = evt.result
    tool.error = evt.error
    tool.durationMs = evt.durationMs
    tool.endMs = Date.now()
  }

  onLlmOutput(evt: OpenClawLlmOutputEvent, _ctx: OpenClawAgentContext): LlmCallRecord | undefined {
    const run = this.runs.get(evt.runId)
    if (!run) return undefined
    // Close the most recently-opened call that doesn't yet have an endMs —
    // the LLM loop is sequential, so this pairs 1:1 with `llm_input`.
    const openCall = this.currentOpenCall(run)
    if (!openCall) return undefined
    openCall.endMs = Date.now()
    openCall.assistantTexts = evt.assistantTexts
    openCall.lastAssistant = evt.lastAssistant
    openCall.usage = evt.usage
    openCall.responseModel = evt.model
    openCall.resolvedRef = evt.resolvedRef
    return openCall
  }

  onAgentEnd(evt: OpenClawAgentEndEvent, ctx: OpenClawAgentContext): RunRecord | undefined {
    const runId = ctx.runId
    if (!runId) return undefined
    const run = this.runs.get(runId)
    if (!run) return undefined
    run.endMs = Date.now()
    run.success = evt.success
    run.error = evt.error
    // Best-effort: close any still-open LLM call that never saw an `llm_output`
    // (e.g. when the run errored mid-call) so the span still has an end time.
    for (const call of run.llmCalls) {
      if (call.endMs === undefined) {
        call.endMs = run.endMs
        if (evt.error && call.error === undefined) call.error = evt.error
      }
      for (const tool of call.toolCalls) {
        if (tool.endMs === undefined) tool.endMs = run.endMs
      }
    }
    for (const tool of run.orphanTools) {
      if (tool.endMs === undefined) tool.endMs = run.endMs
    }
    this.runs.delete(runId)
    return run
  }

  /** Drop a run without emitting — used on errors from the emit path. */
  abandon(runId: string): void {
    this.runs.delete(runId)
  }

  /** Active runs count, for debug logging. */
  inflightCount(): number {
    return this.runs.size
  }

  private ensureRun(runId: string, ctx: OpenClawAgentContext): RunRecord {
    let run = this.runs.get(runId)
    if (run) return run
    run = {
      runId,
      sessionId: ctx.sessionId,
      sessionKey: ctx.sessionKey,
      agentId: ctx.agentId,
      workspaceDir: ctx.workspaceDir,
      messageProvider: ctx.messageProvider,
      trigger: ctx.trigger,
      channelId: ctx.channelId,
      modelProviderId: ctx.modelProviderId,
      modelId: ctx.modelId,
      startMs: Date.now(),
      endMs: undefined,
      success: undefined,
      error: undefined,
      llmCalls: [],
      orphanTools: [],
    }
    this.runs.set(runId, run)
    return run
  }

  private currentOpenCall(run: RunRecord): LlmCallRecord | undefined {
    for (let i = run.llmCalls.length - 1; i >= 0; i--) {
      const call = run.llmCalls[i]
      if (call && call.endMs === undefined) return call
    }
    return undefined
  }

  private findToolRecord(run: RunRecord, toolCallId: string | undefined, toolName: string): ToolCallRecord | undefined {
    // Try matching by toolCallId first since it's unique. Fall back to the
    // most recent unfinished record for the same name if the id is missing
    // or no record matches — defensive coverage for OpenClaw versions that
    // elide toolCallId on after_tool_call.
    const matchesId = (t: ToolCallRecord): boolean => Boolean(toolCallId && t.toolCallId === toolCallId)

    for (const call of run.llmCalls) {
      for (const t of call.toolCalls) if (matchesId(t)) return t
    }
    for (const t of run.orphanTools) if (matchesId(t)) return t

    for (let i = run.llmCalls.length - 1; i >= 0; i--) {
      const call = run.llmCalls[i]
      if (!call) continue
      for (let j = call.toolCalls.length - 1; j >= 0; j--) {
        const t = call.toolCalls[j]
        if (t && t.toolName === toolName && t.endMs === undefined) return t
      }
    }
    for (let i = run.orphanTools.length - 1; i >= 0; i--) {
      const t = run.orphanTools[i]
      if (t && t.toolName === toolName && t.endMs === undefined) return t
    }
    return undefined
  }
}
