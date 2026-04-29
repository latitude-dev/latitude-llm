import { describe, expect, it, vi } from "vitest"
import registerLatitudePlugin, { type OpenClawPluginApiLike } from "./plugin.ts"
import type { BuildResult, SpanRecord } from "./span-builder.ts"

function makeApi(): {
  api: OpenClawPluginApiLike
  fire: (hookName: string, event: unknown, ctx: unknown) => Promise<unknown>
} {
  const handlers = new Map<string, Array<(event: unknown, ctx: unknown) => unknown>>()
  const api: OpenClawPluginApiLike = {
    on: (hookName, handler) => {
      const list = handlers.get(hookName) ?? []
      list.push(handler as (event: unknown, ctx: unknown) => unknown)
      handlers.set(hookName, list)
    },
  }
  async function fire(hookName: string, event: unknown, ctx: unknown): Promise<unknown> {
    let lastReturn: unknown
    for (const h of handlers.get(hookName) ?? []) {
      lastReturn = await h(event, ctx)
    }
    return lastReturn
  }
  return { api, fire }
}

/**
 * Drain any microtasks the plugin queued during the current sync round. The
 * agent_end handler defers the finalize via `queueMicrotask` so that
 * `llm_output` events arriving in the same round (selection.runtime path)
 * still land on the run before serialization. Tests need to flush before
 * asserting on `emitted`.
 */
async function flush(): Promise<void> {
  // Two awaits is enough here: the first lets the queueMicrotask-scheduled
  // finalize run, and the second lets any additional microtasks queued by
  // that finalize run before assertions. This does not wait for unrelated
  // async work that resumes only after timers, I/O, or fetch resolve —
  // postTraces awaits fetch, so its completion is not guaranteed by this
  // helper, and tests must not depend on it.
  await Promise.resolve()
  await Promise.resolve()
}

/**
 * Fire several hook events in a single synchronous round, then await
 * completion of all of them. This faithfully models how OpenClaw's
 * `selection.runtime` dispatches consecutive hooks: it kicks off
 * `runAgentEnd(...).catch(...)` and `runLlmOutput(...).catch(...)` in the
 * same sync stack with no `await` in between, so both plugin handlers run
 * synchronously before any microtask drains.
 *
 * Awaiting between fires (which is what `await fire(...); await fire(...)`
 * does) would let the `queueMicrotask` finalize from agent_end drain BEFORE
 * llm_output's handler runs — that's an artifact of the test harness, not
 * how real OpenClaw behaves on this path.
 */
async function fireSameRound(
  fire: (hookName: string, event: unknown, ctx: unknown) => Promise<unknown>,
  ...hooks: ReadonlyArray<readonly [hookName: string, event: unknown, ctx: unknown]>
): Promise<void> {
  const promises = hooks.map(([name, event, ctx]) => fire(name, event, ctx))
  await Promise.all(promises)
}

function agentSpan(result: BuildResult): SpanRecord {
  const span = result.spans.find((s) => s.name === "agent")
  if (!span) throw new Error("expected an `agent` span on the BuildResult")
  return span
}

function firstResult(emitted: readonly BuildResult[]): BuildResult {
  const first = emitted[0]
  if (!first) throw new Error("expected at least one BuildResult on `emitted`")
  return first
}

describe("registerLatitudePlugin", () => {
  it("does nothing when config is disabled", () => {
    const { api } = makeApi()
    const spy = vi.spyOn(api, "on")
    registerLatitudePlugin(api, {
      config: {
        apiKey: "",
        project: "",
        baseUrl: "",
        enabled: false,
        debug: false,
        allowConversationAccess: false,
      },
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it("reads creds from api.pluginConfig (OpenClaw passes-config path)", () => {
    const { api } = makeApi()
    api.pluginConfig = { apiKey: "k", project: "p", allowConversationAccess: true }
    const spy = vi.spyOn(api, "on")
    registerLatitudePlugin(api)
    expect(spy).toHaveBeenCalled()
  })

  it("subscribes to all the granular paired hooks plus data feeds", () => {
    const { api } = makeApi()
    const spy = vi.spyOn(api, "on")
    registerLatitudePlugin(api, {
      config: {
        apiKey: "x",
        project: "p",
        baseUrl: "http://localhost:0",
        enabled: true,
        debug: false,
        allowConversationAccess: true,
      },
    })
    const subscribed = new Set(spy.mock.calls.map((c) => c[0]))
    for (const name of [
      "before_agent_start",
      "model_call_started",
      "model_call_ended",
      "before_tool_call",
      "after_tool_call",
      "before_compaction",
      "after_compaction",
      "subagent_spawned",
      "subagent_ended",
      "llm_input",
      "llm_output",
      "agent_end",
    ]) {
      expect(subscribed).toContain(name)
    }
  })

  it("before_tool_call handler returns nothing (must not block tool dispatch)", async () => {
    const { api, fire } = makeApi()
    registerLatitudePlugin(api, {
      config: {
        apiKey: "x",
        project: "p",
        baseUrl: "http://localhost:0",
        enabled: true,
        debug: false,
        allowConversationAccess: true,
      },
    })
    // Open a run so the before_tool_call handler has somewhere to attach the span.
    const ctx = { runId: "r-1", sessionId: "s-1", agentId: "router" }
    await fire("before_agent_start", { prompt: "hi" }, ctx)
    const ret = await fire(
      "before_tool_call",
      { toolName: "grep", params: { q: "x" }, runId: "r-1", toolCallId: "tc-1" },
      ctx,
    )
    // Returning anything truthy (especially `{block: true}`) would block the
    // tool. We must return undefined.
    expect(ret).toBeUndefined()
  })

  it("builds the full span tree and emits it on agent_end", async () => {
    const { api, fire } = makeApi()
    const emitted: BuildResult[] = []
    registerLatitudePlugin(api, {
      config: {
        apiKey: "x",
        project: "p",
        baseUrl: "http://localhost:0", // unreachable — fetch fails via logger.warn
        enabled: true,
        debug: false,
        allowConversationAccess: true,
      },
      onEmit: (r) => emitted.push(r),
    })

    const ctx = { runId: "r-1", sessionId: "s-1", sessionKey: "sk-1", agentId: "router" }

    await fire("before_agent_start", { prompt: "do thing" }, ctx)
    await fire(
      "llm_input",
      {
        runId: "r-1",
        sessionId: "s-1",
        provider: "openai",
        model: "gpt-5",
        systemPrompt: "sys",
        prompt: "do thing",
        historyMessages: [],
        imagesCount: 0,
      },
      ctx,
    )
    await fire("model_call_started", { runId: "r-1", callId: "A", provider: "openai", model: "gpt-5" }, ctx)
    await fire(
      "model_call_ended",
      { runId: "r-1", callId: "A", provider: "openai", model: "gpt-5", outcome: "completed", durationMs: 100 },
      ctx,
    )
    await fire("before_tool_call", { toolName: "grep", params: { q: "x" }, runId: "r-1", toolCallId: "tc-1" }, ctx)
    await fire(
      "after_tool_call",
      { toolName: "grep", params: { q: "x" }, runId: "r-1", toolCallId: "tc-1", result: "1 match" },
      ctx,
    )
    await fire("model_call_started", { runId: "r-1", callId: "B", provider: "openai", model: "gpt-5" }, ctx)
    await fire(
      "model_call_ended",
      { runId: "r-1", callId: "B", provider: "openai", model: "gpt-5", outcome: "completed", durationMs: 80 },
      ctx,
    )
    await fire(
      "llm_output",
      {
        runId: "r-1",
        sessionId: "s-1",
        provider: "openai",
        model: "gpt-5",
        resolvedRef: "openai/gpt-5",
        assistantTexts: ["done"],
        lastAssistant: { role: "assistant", content: "done" },
        usage: { input: 10, output: 2, total: 12 },
      },
      ctx,
    )
    await fire("agent_end", { messages: [], success: true, durationMs: 200 }, ctx)
    await flush()

    expect(emitted).toHaveLength(1)
    const result = emitted[0]
    if (!result) throw new Error("expected result")
    const names = result.spans.map((s) => s.name).sort()
    expect(names).toEqual(["agent", "model_call", "model_call", "tool_call:grep"])
    // Two model_call spans, not one big llm_request.
  })
})

// ─── Deferred finalize regression tests ───────────────────────────────────────
//
// OpenClaw 2026.4.26+ has two hook fire-orders depending on the runtime path:
//
//   selection.runtime (codex / embedded ACPX):
//     llm_input → ...model_calls / tool_calls... → agent_end → llm_output
//
//   cli-runner.runtime (claude-code):
//     llm_input → llm_output (only when assistantText.length > 0) → agent_end
//
// Synchronous finalize on agent_end would silently drop every `llm_output`
// field (output messages, response model, resolved ref, harness id, full
// `gen_ai.usage.*` block) on the selection path — `onLlmOutput` arrives after
// the run was deleted, hits `if (!run) return`, no error, no warn, just gone.
// Deferring the finalize via `queueMicrotask` lets both event handlers in the
// same sync round write to the still-alive run before serialization.

describe("deferred finalize: llm_output enrichment under both fire orders", () => {
  function makePlugin(): {
    fire: ReturnType<typeof makeApi>["fire"]
    emitted: BuildResult[]
  } {
    const { api, fire } = makeApi()
    const emitted: BuildResult[] = []
    registerLatitudePlugin(api, {
      config: {
        apiKey: "x",
        project: "p",
        baseUrl: "http://localhost:0",
        enabled: true,
        debug: false,
        allowConversationAccess: true,
      },
      onEmit: (r) => emitted.push(r),
    })
    return { fire, emitted }
  }

  const llmOutputEvt = {
    runId: "r-1",
    sessionId: "s-1",
    provider: "openai",
    model: "gpt-5",
    resolvedRef: "openai/gpt-5",
    harnessId: "harness-7",
    assistantTexts: ["all done"],
    lastAssistant: { role: "assistant", content: "all done" },
    usage: { input: 12, output: 5, cacheRead: 4, cacheWrite: 0, total: 21 },
  }

  function expectFullyEnriched(result: BuildResult): void {
    const agent = agentSpan(result)
    // The `llm_output` fields the selection-path bug used to drop:
    expect(agent.attrs["gen_ai.response.model"]).toBe("gpt-5")
    expect(agent.attrs["openclaw.resolved.ref"]).toBe("openai/gpt-5")
    expect(agent.attrs["openclaw.harness.id"]).toBe("harness-7")
    expect(agent.attrs["gen_ai.usage.input_tokens"]).toBe(12)
    expect(agent.attrs["gen_ai.usage.output_tokens"]).toBe(5)
    expect(agent.attrs["gen_ai.usage.total_tokens"]).toBe(21)
    expect(agent.attrs["gen_ai.usage.cache_read_input_tokens"]).toBe(4)
    expect(agent.attrs["gen_ai.output.messages:gated"]).toBeDefined()
    // The `agent_end` field that always lands:
    expect(agent.attrs["openclaw.run.success"]).toBe(true)
  }

  it("cli-runner order: llm_output BEFORE agent_end → output captured", async () => {
    const { fire, emitted } = makePlugin()
    const ctx = { runId: "r-1", sessionId: "s-1", agentId: "router" }

    await fire("before_agent_start", { prompt: "do thing" }, ctx)
    await fire(
      "llm_input",
      {
        runId: "r-1",
        sessionId: "s-1",
        provider: "openai",
        model: "gpt-5",
        prompt: "do thing",
        historyMessages: [],
        imagesCount: 0,
      },
      ctx,
    )
    await fire("llm_output", llmOutputEvt, ctx)
    await fire("agent_end", { messages: [], success: true, durationMs: 200 }, ctx)
    await flush()

    expect(emitted).toHaveLength(1)
    expectFullyEnriched(firstResult(emitted))
  })

  it("selection.runtime order: agent_end BEFORE llm_output → output STILL captured", async () => {
    const { fire, emitted } = makePlugin()
    const ctx = { runId: "r-1", sessionId: "s-1", agentId: "router" }

    await fire("before_agent_start", { prompt: "do thing" }, ctx)
    await fire(
      "llm_input",
      {
        runId: "r-1",
        sessionId: "s-1",
        provider: "openai",
        model: "gpt-5",
        prompt: "do thing",
        historyMessages: [],
        imagesCount: 0,
      },
      ctx,
    )
    // agent_end fires FIRST (selection.runtime). With synchronous finalize,
    // the run would be deleted before llm_output arrives and every
    // llm_output-only field would be silently dropped. Both hooks fire in
    // the SAME sync round (no `await` between them) — that's what the real
    // OpenClaw `selection.runtime` dispatcher does. See `fireSameRound`.
    await fireSameRound(
      fire,
      ["agent_end", { messages: [], success: true, durationMs: 200 }, ctx],
      ["llm_output", llmOutputEvt, ctx],
    )
    await flush()

    expect(emitted).toHaveLength(1)
    expectFullyEnriched(firstResult(emitted))
  })

  it("no llm_output (cli path with empty assistantText): finalize still ships", async () => {
    const { fire, emitted } = makePlugin()
    const ctx = { runId: "r-1", sessionId: "s-1", agentId: "router" }

    await fire("before_agent_start", { prompt: "do thing" }, ctx)
    await fire(
      "llm_input",
      {
        runId: "r-1",
        sessionId: "s-1",
        provider: "openai",
        model: "gpt-5",
        prompt: "do thing",
        historyMessages: [],
        imagesCount: 0,
      },
      ctx,
    )
    // No llm_output (cli-runner skips it when assistantText.length === 0).
    await fire("agent_end", { messages: [], success: true, durationMs: 200 }, ctx)
    await flush()

    expect(emitted).toHaveLength(1)
    const agent = agentSpan(firstResult(emitted))
    // agent_end fields are present:
    expect(agent.attrs["openclaw.run.success"]).toBe(true)
    // llm_output-only fields are NOT present, but the run still emitted:
    expect(agent.attrs["gen_ai.response.model"]).toBeUndefined()
    expect(agent.attrs["gen_ai.usage.input_tokens"]).toBeUndefined()
  })

  it("subagents: same fix applies — child agent_end + llm_output captured under selection order", async () => {
    const { fire, emitted } = makePlugin()
    const parentCtx = { runId: "parent", sessionId: "s-parent", agentId: "router" }
    const childCtx = { runId: "child", sessionId: "s-child", agentId: "code-agent" }

    // Parent run
    await fire("before_agent_start", { prompt: "outer task" }, parentCtx)
    await fire(
      "llm_input",
      {
        runId: "parent",
        sessionId: "s-parent",
        provider: "openai",
        model: "gpt-5",
        prompt: "outer task",
        historyMessages: [],
        imagesCount: 0,
      },
      parentCtx,
    )

    // Parent spawns a subagent — child runId is registered with parent's
    // traceId so the child's spans nest under the parent's `subagent` span.
    await fire(
      "subagent_spawned",
      { runId: "parent", childSessionKey: "child", agentId: "code-agent", label: "code", mode: "run" },
      parentCtx,
    )

    // ─── Child agent runs through the SAME `onAgentEnd` path as a top-level
    // ─── agent. Selection-runtime order applies: child's `agent_end` fires
    // ─── before child's `llm_output`. Without deferred finalize, child's
    // ─── llm_output enrichment would be silently dropped — same bug, just
    // ─── one level deep.
    await fire("before_agent_start", { prompt: "inner task" }, childCtx)
    await fire(
      "llm_input",
      {
        runId: "child",
        sessionId: "s-child",
        provider: "openai",
        model: "gpt-5",
        prompt: "inner task",
        historyMessages: [],
        imagesCount: 0,
      },
      childCtx,
    )
    await fireSameRound(
      fire,
      ["agent_end", { messages: [], success: true, durationMs: 50 }, childCtx],
      ["llm_output", { ...llmOutputEvt, runId: "child" }, childCtx],
    )
    await flush()

    // Then the parent finalizes. subagent_ended fires before parent's own
    // agent_end (parent's view of the child completing). agent_end and
    // llm_output fire in the same selection.runtime round.
    await fire("subagent_ended", { runId: "parent", childSessionKey: "child", outcome: "completed" }, parentCtx)
    await fireSameRound(
      fire,
      ["agent_end", { messages: [], success: true, durationMs: 200 }, parentCtx],
      ["llm_output", { ...llmOutputEvt, runId: "parent" }, parentCtx],
    )
    await flush()

    expect(emitted).toHaveLength(2)
    // Both parent and child should have full output enrichment:
    for (const result of emitted) {
      expectFullyEnriched(result)
    }
  })
})
