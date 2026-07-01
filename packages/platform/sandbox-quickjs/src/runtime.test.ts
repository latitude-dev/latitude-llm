import {
  DEFAULT_SCRIPT_MEMORY_BYTES,
  DEFAULT_SCRIPT_STACK_SIZE_BYTES,
  type HostLlmCall,
  type HostLlmFunction,
  minimalScriptSession,
  type RunResult,
  type ScriptRunError,
  type ScriptRunInput,
  type ScriptRunLimits,
  type ScriptSessionContext,
} from "@domain/sandbox"
import { Cause, Effect, Exit } from "effect"
import { describe, expect, it } from "vitest"
import { createQuickJsScriptRuntime } from "./runtime.ts"

const runtime = createQuickJsScriptRuntime()

const compile = (source: string) => Effect.runPromise(runtime.compile({ source }))

const run = (input: ScriptRunInput) => Effect.runPromise(runtime.run(input))

const runError = async (input: ScriptRunInput): Promise<ScriptRunError> => {
  const exit = await Effect.runPromiseExit(runtime.run(input))
  if (Exit.isSuccess(exit)) throw new Error(`expected run to fail, got ${JSON.stringify(exit.value)}`)
  const error = Cause.findErrorOption(exit.cause)
  if (error._tag !== "Some") throw new Error("expected a typed run error")
  return error.value as ScriptRunError
}

const compileAndRun = async (
  source: string,
  options?: { llm?: HostLlmFunction; limits?: ScriptRunLimits },
): Promise<RunResult> => {
  const script = await compile(source)
  return run({
    script,
    context: { session: minimalScriptSession([{ role: "user", content: "hello" }]) },
    ...(options?.llm ? { llm: options.llm } : {}),
    ...(options?.limits ? { limits: options.limits } : {}),
  })
}

const tightLimits = (overrides?: Partial<ScriptRunLimits>): ScriptRunLimits => ({
  wallTimeMs: 2_000,
  cpuTicks: 1_000_000,
  memoryBytes: DEFAULT_SCRIPT_MEMORY_BYTES,
  stackSizeBytes: DEFAULT_SCRIPT_STACK_SIZE_BYTES,
  ...overrides,
})

describe("compile", () => {
  it("hashes the source and detects capabilities", async () => {
    const pure = await compile("return Score(1)")
    expect(pure.contentHash).toMatch(/^[0-9a-f]{64}$/)
    expect(pure.capabilities).toEqual([])

    const judge = await compile("const r = await llm(`x`); return Score(1)")
    expect(judge.capabilities).toEqual(["llm"])
  })

  it("is deterministic per source (bytecode-cache key correctness)", async () => {
    const first = await compile("return Score(1)")
    const second = await compile("return Score(1)")
    const different = await compile("return Score(0)")
    expect(second.contentHash).toBe(first.contentHash)
    expect(different.contentHash).not.toBe(first.contentHash)
  })

  it("rejects scripts that do not compile, at compile time", async () => {
    const exit = await Effect.runPromiseExit(runtime.compile({ source: "return ((" }))
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = Cause.findErrorOption(exit.cause)
      expect(error._tag === "Some" && error.value._tag).toBe("ScriptCompileError")
    }
  })

  it("accepts await and return in the script body", async () => {
    const script = await compile("const x = await Promise.resolve(1); return Score(x)")
    expect(script.contentHash).toBeTruthy()
  })
})

describe("run: the score contract", () => {
  it("maps Score/Passed/Failed sugar onto the single score shape", async () => {
    expect(await compileAndRun("return Score(0.7, 'why')")).toMatchObject({ value: 0.7, feedback: "why" })
    expect(await compileAndRun("return Passed()")).toMatchObject({ value: 1 })
    expect(await compileAndRun("return Passed(undefined, 'fine')")).toMatchObject({ value: 1, feedback: "fine" })
    expect(await compileAndRun("return Failed()")).toMatchObject({ value: 0 })
    expect(await compileAndRun("return Failed(0.2, 'meh')")).toMatchObject({ value: 0.2, feedback: "meh" })
  })

  it("meters pure runs with zero tokens and cost", async () => {
    const result = await compileAndRun("return Score(1)")
    expect(result.tokens).toBe(0)
    expect(result.cost).toBe(0)
    expect(result.duration).toBeGreaterThan(0)
  })

  it("rejects out-of-range or non-numeric scores as runtime errors", async () => {
    const script = await compile("return Score(2)")
    const error = await runError({ script, context: { session: minimalScriptSession() } })
    expect(error._tag).toBe("ScriptRuntimeError")

    const nan = await compile("return Score('high')")
    expect((await runError({ script: nan, context: { session: minimalScriptSession() } }))._tag).toBe(
      "ScriptRuntimeError",
    )
  })

  it("rejects runs that do not return a Score", async () => {
    const script = await compile("return { value: 1 }")
    const error = await runError({ script, context: { session: minimalScriptSession() } })
    expect(error._tag).toBe("ScriptRuntimeError")
    expect(error.message).toContain("must return Score")
  })

  it("surfaces script throws as ScriptRuntimeError", async () => {
    const script = await compile("throw new Error('detector blew up')")
    const error = await runError({ script, context: { session: minimalScriptSession() } })
    expect(error._tag).toBe("ScriptRuntimeError")
    expect(error.message).toContain("detector blew up")
  })

  it("pure runs are deterministic functions of (definition, trace)", async () => {
    const script = await compile("return Score(session.conversation[0].content.includes('hello') ? 1 : 0)")
    const context = { session: minimalScriptSession([{ role: "user", content: "hello there" }]) }
    const first = await run({ script, context })
    const second = await run({ script, context })
    expect(second.value).toBe(first.value)
    expect(first.value).toBe(1)
  })
})

describe("run: host-controlled globals", () => {
  it("exposes session.conversation as a read-only view that stringifies as prompt lines", async () => {
    const script = await compile(`
      const text = \`\${session.conversation}\`
      const frozen = Object.isFrozen(session.conversation) && Object.isFrozen(session.conversation[0])
      return Score(text === "[user] hi\\n[assistant] yo" && frozen ? 1 : 0)
    `)
    const result = await run({
      script,
      context: {
        session: minimalScriptSession([
          { role: "user", content: "hi" },
          { role: "assistant", content: "yo" },
        ]),
      },
    })
    expect(result.value).toBe(1)
  })

  it("exposes conversation as a top-level alias for session.conversation", async () => {
    const script = await compile(`
      const text = \`\${conversation}\`
      const isSameRef = conversation === session.conversation
      return Score(text === "[user] hi\\n[assistant] yo" && isSameRef ? 1 : 0)
    `)
    const result = await run({
      script,
      context: {
        session: minimalScriptSession([
          { role: "user", content: "hi" },
          { role: "assistant", content: "yo" },
        ]),
      },
    })
    expect(result.value).toBe(1)
  })

  it("exposes session and not the legacy issue/signal globals", async () => {
    const script = await compile(
      "return Score(typeof session === 'object' && typeof issue === 'undefined' && typeof signal === 'undefined' ? 1 : 0)",
    )
    const result = await run({ script, context: { session: minimalScriptSession() } })
    expect(result.value).toBe(1)
  })

  it("serializes the full session payload (metrics, per-trace rollups, tools) into the script", async () => {
    const session: ScriptSessionContext = {
      id: "session-1",
      traceCount: 1,
      spanCount: 2,
      errorCount: 1,
      duration: 1_500,
      timeToFirstToken: 50,
      cost: { input: 1, output: 2, total: 3 },
      tokens: { input: 10, output: 20, total: 30, cacheRead: 0, cacheCreate: 0, reasoning: 0 },
      startTime: "2026-01-01T00:00:00.000Z",
      endTime: "2026-01-01T00:00:01.500Z",
      userId: "user-1",
      tags: ["checkout"],
      metadata: { env: "prod" },
      conversation: [{ role: "assistant", content: "done" }],
      traces: [
        {
          id: "trace-1",
          name: "root",
          status: "error",
          errorCount: 1,
          spanCount: 2,
          duration: 1_500,
          timeToFirstToken: 50,
          cost: { input: 1, output: 2, total: 3 },
          tokens: { input: 10, output: 20, total: 30, cacheRead: 0, cacheCreate: 0, reasoning: 0 },
          models: ["gpt-4o"],
          providers: ["openai"],
          finishReasons: ["length"],
          tools: [{ name: "search", input: "{q:1}", output: "[]", error: true, duration: 42 }],
        },
      ],
    }
    const script = await compile(`
      const t = session.traces[0]
      const tool = t.tools[0]
      const ok =
        session.errorCount === 1 &&
        session.tags[0] === "checkout" &&
        session.metadata.env === "prod" &&
        t.status === "error" &&
        t.cost.total === 3 &&
        t.tokens.input === 10 &&
        t.models[0] === "gpt-4o" &&
        t.finishReasons[0] === "length" &&
        tool.name === "search" &&
        tool.error === true &&
        tool.duration === 42 &&
        // the whole payload is deep-frozen — traces, their arrays, and tools are immutable
        Object.isFrozen(session.traces) &&
        Object.isFrozen(t) &&
        Object.isFrozen(t.models) &&
        Object.isFrozen(t.tools) &&
        Object.isFrozen(tool)
      return Score(ok ? 1 : 0, JSON.stringify({ tools: t.tools.length, model: t.models[0] }))
    `)
    const result = await run({ script, context: { session } })
    expect(result).toMatchObject({ value: 1, feedback: '{"tools":1,"model":"gpt-4o"}' })
  })

  it("validates values host-side through parse()", async () => {
    const ok = await compileAndRun(`
      const parsed = parse({ passed: true, feedback: "fine" }, z.object({ passed: z.boolean(), feedback: z.string() }))
      return Score(parsed.passed ? 1 : 0, parsed.feedback)
    `)
    expect(ok).toMatchObject({ value: 1, feedback: "fine" })

    const bad = await compile(`
      try {
        parse({ passed: "yes" }, z.object({ passed: z.boolean() }))
        return Score(0, "validation should have failed")
      } catch (error) {
        return Score(1, String(error.message).slice(0, 32))
      }
    `)
    const result = await run({ script: bad, context: { session: minimalScriptSession() } })
    expect(result.value).toBe(1)
    expect(result.feedback).toContain("validation failed")
  })

  it("supports zod-only CommonJS imports without exposing general require", async () => {
    const zod = await compileAndRun(`
      const { z } = require("zod")
      const parsed = parse({ ok: true }, z.object({ ok: z.boolean() }))
      return Score(parsed.ok ? 1 : 0)
    `)
    expect(zod.value).toBe(1)

    const zodV4 = await compileAndRun(`
      const zod = require("zod/v4")
      const parsed = parse({ ok: true }, zod.object({ ok: zod.boolean() }))
      return Score(parsed.ok ? 1 : 0)
    `)
    expect(zodV4.value).toBe(1)

    const script = await compile('require("node:fs"); return Score(0)')
    const error = await runError({ script, context: { session: minimalScriptSession() } })
    expect(error._tag).toBe("ScriptRuntimeError")
    expect(error.message).toContain('require() is unavailable in the sandbox for module "node:fs"')
  })
})

describe("run: llm host calls", () => {
  const judgeScript = `const result = await llm(
  \`Judge:\n\${session.conversation}\`,
  { schema: z.object({ passed: z.boolean(), feedback: z.string() }) }
)

if (result.passed) {
  return Passed(1, result.feedback)
} else {
  return Failed(0, result.feedback)
}`

  it("suspends the script while the host performs the call and meters usage", async () => {
    const calls: HostLlmCall[] = []
    const result = await compileAndRun(judgeScript, {
      llm: async (call) => {
        calls.push(call)
        await new Promise((resolve) => setTimeout(resolve, 10))
        return { object: { passed: false, feedback: "exhibits the issue" }, tokens: 42, duration: 1_000, cost: 7 }
      },
    })

    expect(result).toMatchObject({ value: 0, feedback: "exhibits the issue", tokens: 42, cost: 7 })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.prompt).toBe("Judge:\n[user] hello")
    expect(calls[0]?.schema).toEqual({
      kind: "object",
      shape: { passed: { kind: "boolean" }, feedback: { kind: "string" } },
    })
  })

  it("aggregates metering across several llm calls", async () => {
    const result = await compileAndRun(
      `
      const first = await llm("one", { schema: z.object({ ok: z.boolean() }) })
      const second = await llm("two", { schema: z.object({ ok: z.boolean() }) })
      return Score(first.ok && second.ok ? 1 : 0)
      `,
      { llm: async () => ({ object: { ok: true }, tokens: 10, duration: 500, cost: 3 }) },
    )
    expect(result).toMatchObject({ value: 1, tokens: 20, cost: 6 })
  })

  it("accepts zod schemas imported through the compatibility require shim", async () => {
    const calls: HostLlmCall[] = []
    const result = await compileAndRun(
      `
      const { z } = require("zod")
      const result = await llm("one", { schema: z.object({ ok: z.boolean() }) })
      return Score(result.ok ? 1 : 0)
      `,
      {
        llm: async (call) => {
          calls.push(call)
          return { object: { ok: true }, tokens: 10, duration: 500, cost: 3 }
        },
      },
    )
    expect(result).toMatchObject({ value: 1, tokens: 10, cost: 3 })
    expect(calls[0]?.schema).toEqual({ kind: "object", shape: { ok: { kind: "boolean" } } })
  })

  it("does not inject llm for pure-capability scripts", async () => {
    const script = await compile("return Score(typeof llm === 'undefined' ? 1 : 0)")
    expect(script.capabilities).toEqual([])
    const result = await run({
      script,
      context: { session: minimalScriptSession() },
      llm: async () => ({ object: {}, tokens: 0, duration: 0, cost: 0 }),
    })
    expect(result.value).toBe(1)
  })

  it("fails uncaught host failures as HostCallError (transient, retryable)", async () => {
    const script = await compile(judgeScript)
    const error = await runError({
      script,
      context: { session: minimalScriptSession() },
      llm: async () => {
        throw new Error("upstream timeout")
      },
    })
    expect(error._tag).toBe("HostCallError")
    expect(error.message).toContain("upstream timeout")
  })

  it("lets scripts catch host failures and still return a score", async () => {
    const result = await compileAndRun(
      `
      try {
        await llm("x", { schema: z.object({ ok: z.boolean() }) })
        return Score(0)
      } catch (error) {
        return Score(1, "recovered")
      }
      `,
      {
        llm: async () => {
          throw new Error("upstream timeout")
        },
      },
    )
    expect(result).toMatchObject({ value: 1, feedback: "recovered" })
  })

  it("fails fast when an llm-capability script runs without a host implementation", async () => {
    const script = await compile("await llm('x'); return Score(1)")
    const error = await runError({ script, context: { session: minimalScriptSession() }, limits: tightLimits() })
    expect(error._tag).toBe("ScriptRuntimeError")
    expect(error.message).toContain("without a host llm implementation")
  })

  it("treats a forged llm() schema as a deterministic script error, never a transient host failure", async () => {
    const calls: HostLlmCall[] = []
    const script = await compile("const r = await llm('x', { schema: { kind: 'exploit' } }); return Score(1)")
    const error = await runError({
      script,
      context: { session: minimalScriptSession() },
      llm: async (call) => {
        calls.push(call)
        return { object: {}, tokens: 0, duration: 0, cost: 0 }
      },
    })
    expect(error._tag).toBe("ScriptRuntimeError")
    expect(error.message).toContain("requires a schema built with the z global")
    expect(calls).toHaveLength(0)
  })

  it("does not let scripts masquerade their own throws as transient host failures", async () => {
    const script = await compile("const e = new Error('fake'); e.name = 'HostCallError'; throw e")
    const error = await runError({ script, context: { session: minimalScriptSession() } })
    expect(error._tag).toBe("ScriptRuntimeError")
  })

  it("rejects llm calls without a schema before reaching the host", async () => {
    const calls: HostLlmCall[] = []
    const llm: HostLlmFunction = async (call) => {
      calls.push(call)
      return { object: {}, tokens: 0, duration: 0, cost: 0 }
    }

    for (const source of ["await llm('x'); return Score(1)", "await llm('x', {}); return Score(1)"]) {
      const script = await compile(source)
      const error = await runError({ script, context: { session: minimalScriptSession() }, llm, limits: tightLimits() })
      expect(error._tag).toBe("ScriptRuntimeError")
      expect(error.message).toContain("llm() requires a schema")
    }
    expect(calls).toHaveLength(0)
  })
})
