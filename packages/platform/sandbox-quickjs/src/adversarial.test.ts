import {
  DEFAULT_SCRIPT_MEMORY_BYTES,
  DEFAULT_SCRIPT_STACK_SIZE_BYTES,
  type ScriptRunError,
  type ScriptRunInput,
  type ScriptRunLimits,
} from "@domain/sandbox"
import { Cause, Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { createQuickJsScriptRuntime } from "./runtime.ts"

/**
 * Every hostile script must die by budget or boundary — never by worker.
 * Limits here are intentionally tiny so the suite stays fast.
 */
const runtime = createQuickJsScriptRuntime()

const limits = (overrides?: Partial<ScriptRunLimits>): ScriptRunLimits => ({
  wallTimeMs: 500,
  cpuTicks: 1_000_000_000,
  memoryBytes: DEFAULT_SCRIPT_MEMORY_BYTES,
  stackSizeBytes: DEFAULT_SCRIPT_STACK_SIZE_BYTES,
  ...overrides,
})

const runError = async (source: string, input?: Partial<ScriptRunInput>): Promise<ScriptRunError> => {
  const script = await Effect.runPromise(runtime.compile({ source }))
  const exit = await Effect.runPromiseExit(
    runtime.run({ script, context: { conversation: [] }, limits: limits(), ...input }),
  )
  if (Exit.isSuccess(exit)) throw new Error(`expected run to fail, got ${JSON.stringify(exit.value)}`)
  const error = Cause.findErrorOption(exit.cause)
  if (error._tag !== "Some") throw new Error("expected a typed run error")
  return error.value as ScriptRunError
}

describe("hostile scripts die by budget", () => {
  it("kills infinite loops by cpu budget", async () => {
    const error = await runError("while (true) {}", { limits: limits({ cpuTicks: 50, wallTimeMs: 10_000 }) })
    expect(error).toMatchObject({ _tag: "ScriptLimitExceededError", limit: "cpu" })
  })

  it("kills infinite loops by wall clock when the cpu budget is loose", async () => {
    const startedAt = Date.now()
    const error = await runError("while (true) {}")
    expect(error).toMatchObject({ _tag: "ScriptLimitExceededError", limit: "wall-clock" })
    expect(Date.now() - startedAt).toBeLessThan(5_000)
  })

  // The test timeout must outlive the run's 10s wall-clock backstop: if vitest
  // kills the test first (slow CI under full-suite load), disposal races the
  // in-flight abort and trips QuickJS's gc_obj_list assertion at JS_FreeRuntime.
  it("kills memory bombs by memory cap", { timeout: 15_000 }, async () => {
    const error = await runError("const a = []; while (true) { a.push(new Array(65536).fill('x')) }", {
      limits: limits({ memoryBytes: 8 * 1024 * 1024, wallTimeMs: 10_000 }),
    })
    expect(error).toMatchObject({ _tag: "ScriptLimitExceededError", limit: "memory" })
  })

  it("kills catastrophic regex backtracking by budget", async () => {
    const error = await runError("return Score(/^(a+)+$/.test('a'.repeat(64) + 'b') ? 1 : 0)")
    expect(error._tag).toBe("ScriptLimitExceededError")
  })

  it("kills unbounded recursion by stack cap", async () => {
    const error = await runError("const f = () => f() + 1; return Score(f())")
    expect(error).toMatchObject({ _tag: "ScriptLimitExceededError", limit: "stack" })
  })

  it("kills runs stuck on a host call that never settles by wall clock", async () => {
    const error = await runError("await llm('x', { schema: z.object({ ok: z.boolean() }) }); return Score(1)", {
      llm: () => new Promise(() => {}),
    })
    expect(error).toMatchObject({ _tag: "ScriptLimitExceededError", limit: "wall-clock" })
  })
})

describe("isolation boundary", () => {
  it("exposes no ambient I/O, timers, process, or module system", async () => {
    const script = await Effect.runPromise(
      runtime.compile({
        source: `
          const leaks = ["fetch", "setTimeout", "setInterval", "process", "require", "XMLHttpRequest", "WebSocket"]
            .filter((name) => typeof globalThis[name] !== "undefined")
          return Score(leaks.length === 0 ? 1 : 0, leaks.join(","))
        `,
      }),
    )
    const result = await Effect.runPromise(runtime.run({ script, context: { conversation: [] }, limits: limits() }))
    expect(result.feedback ?? "").toBe("")
    expect(result.value).toBe(1)
  })

  it("rejects dynamic import", async () => {
    const error = await runError("await import('node:fs'); return Score(1)")
    expect(error._tag).toBe("ScriptRuntimeError")
  })

  it("does not leak prototype pollution across runs", async () => {
    const polluting = await Effect.runPromise(
      runtime.compile({ source: "Object.prototype.polluted = 'yes'; return Score(({}).polluted === 'yes' ? 1 : 0)" }),
    )
    const pollutingResult = await Effect.runPromise(
      runtime.run({ script: polluting, context: { conversation: [] }, limits: limits() }),
    )
    expect(pollutingResult.value).toBe(1)

    const probe = await Effect.runPromise(
      runtime.compile({ source: "return Score(({}).polluted === undefined ? 1 : 0)" }),
    )
    const probeResult = await Effect.runPromise(
      runtime.run({ script: probe, context: { conversation: [] }, limits: limits() }),
    )
    expect(probeResult.value).toBe(1)

    expect(({} as { polluted?: string }).polluted).toBeUndefined()
  })

  it("survives host-function abuse with malformed schemas", async () => {
    const result = await Effect.runPromise(
      runtime.run({
        script: await Effect.runPromise(
          runtime.compile({
            source: `
              try {
                parse(1, { kind: "exploit", __proto__: { hax: true } })
                return Score(0, "parse accepted a forged schema")
              } catch (error) {
                return Score(1)
              }
            `,
          }),
        ),
        context: { conversation: [] },
        limits: limits(),
      }),
    )
    expect(result.value).toBe(1)
  })

  it("keeps hostile conversation content inert", async () => {
    const script = await Effect.runPromise(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder must interpolate inside the sandbox, not here
      runtime.compile({ source: "return Score(1, `${conversation}`.slice(0, 64))" }),
    )
    const result = await Effect.runPromise(
      runtime.run({
        script,
        context: { conversation: [{ role: "user", content: "`); globalThis.escaped = true; (`" }] },
        limits: limits(),
      }),
    )
    expect(result.value).toBe(1)
    expect((globalThis as { escaped?: boolean }).escaped).toBeUndefined()
  })
})
