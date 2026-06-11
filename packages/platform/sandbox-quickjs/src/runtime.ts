import {
  buildSchemaFromDescriptor,
  type CompiledScript,
  DEFAULT_LLM_SCRIPT_LIMITS,
  DEFAULT_PURE_SCRIPT_LIMITS,
  HostCallError,
  type HostLlmFunction,
  hasLlmCapability,
  type RunResult,
  resolveScriptCapabilities,
  runResultSchema,
  ScriptCompileError,
  ScriptLimitExceededError,
  type ScriptLimitKind,
  type ScriptRunError,
  type ScriptRunInput,
  type ScriptRunLimits,
  ScriptRuntime,
  ScriptRuntimeError,
  type ScriptRuntimeShape,
  schemaDescriptorSchema,
  scriptScoreSchema,
} from "@domain/sandbox"
import { Effect, Layer } from "effect"
import { getQuickJS, type QuickJSContext, type QuickJSHandle, type QuickJSRuntime } from "quickjs-emscripten"
import { SANDBOX_PRELUDE } from "./prelude.ts"

const SCRIPT_FILENAME = "latitude-script.js"
const PRELUDE_FILENAME = "latitude-prelude.js"
const COMPILE_CACHE_MAX_ENTRIES = 1_000

/**
 * The stored artifact is the body of a host-controlled async function: it can
 * `await llm(...)` and must `return Score(...)`.
 */
const wrapScriptSource = (source: string): string => `(async () => {\n${source}\n})()`

const sha256Hex = async (source: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

const formatQuickJsError = (dumped: unknown): string => {
  if (typeof dumped === "object" && dumped !== null && "message" in dumped) {
    const name = "name" in dumped && typeof dumped.name === "string" ? dumped.name : "Error"
    return `${name}: ${String((dumped as { message: unknown }).message)}`
  }
  return String(dumped)
}

interface RunState {
  disposed: boolean
  trippedLimit: ScriptLimitKind | null
  tokens: number
  cost: number
  hostCallError: HostCallError | null
}

const HOST_CALL_ERROR_NAME = "HostCallError"

const toLimitError = (limit: ScriptLimitKind, limits: ScriptRunLimits): ScriptLimitExceededError => {
  const budget = {
    "wall-clock": `${limits.wallTimeMs}ms wall clock`,
    cpu: `${limits.cpuTicks} cpu ticks`,
    memory: `${limits.memoryBytes} bytes of memory`,
    stack: `${limits.stackSizeBytes} bytes of stack`,
  }[limit]
  return new ScriptLimitExceededError({ limit, message: `Script exceeded its budget of ${budget}` })
}

const mapThrownError = (state: RunState, limits: ScriptRunLimits, dumped: unknown): ScriptRunError => {
  if (state.trippedLimit !== null) return toLimitError(state.trippedLimit, limits)

  const message = formatQuickJsError(dumped)
  const lowered = message.toLowerCase()
  if (lowered.includes("out of memory")) return toLimitError("memory", limits)
  if (lowered.includes("stack overflow") || lowered.includes("maximum call stack")) {
    return toLimitError("stack", limits)
  }
  if (lowered.includes("interrupted")) return toLimitError("cpu", limits)

  const erroredName =
    typeof dumped === "object" && dumped !== null && "name" in dumped ? (dumped as { name: unknown }).name : null
  if (erroredName === HOST_CALL_ERROR_NAME) {
    return state.hostCallError ?? new HostCallError({ message })
  }

  return new ScriptRuntimeError({ message })
}

/** Evaluates a JSON-safe host value into the context as a fresh handle. */
const jsonToHandle = (context: QuickJSContext, value: unknown): QuickJSHandle => {
  const result = context.evalCode(`(${JSON.stringify(value ?? null)})`)
  return context.unwrapResult(result)
}

const installHostParse = (context: QuickJSContext): void => {
  const fn = context.newFunction("__hostParse", (valueHandle, schemaHandle) => {
    const value: unknown = valueHandle === undefined ? undefined : context.dump(valueHandle)
    const rawDescriptor: unknown = schemaHandle === undefined ? undefined : context.dump(schemaHandle)
    const descriptor = schemaDescriptorSchema.safeParse(rawDescriptor)
    if (!descriptor.success) {
      throw new Error("parse() requires a schema built with the z global")
    }
    const parsed = buildSchemaFromDescriptor(descriptor.data).safeParse(value)
    if (!parsed.success) {
      throw new Error(`parse() validation failed: ${parsed.error.message}`)
    }
    return jsonToHandle(context, parsed.data)
  })
  context.setProp(context.global, "__hostParse", fn)
  fn.dispose()
}

const installHostLlm = (
  context: QuickJSContext,
  runtime: QuickJSRuntime,
  state: RunState,
  hostLlm: HostLlmFunction,
): void => {
  const fn = context.newFunction("__hostLlm", (callHandle) => {
    const rawCall: unknown = callHandle === undefined ? undefined : context.dump(callHandle)
    const call = rawCall as { prompt: string; schema?: unknown }
    const deferred = context.newPromise()

    const hostWork = async () => {
      const schema = call.schema === undefined ? undefined : schemaDescriptorSchema.parse(call.schema)
      return await hostLlm({ prompt: call.prompt, ...(schema !== undefined ? { schema } : {}) })
    }

    hostWork().then(
      (result) => {
        if (state.disposed) return
        state.tokens += result.tokens
        state.cost += result.cost
        const handle = jsonToHandle(context, result.object)
        deferred.resolve(handle)
        handle.dispose()
      },
      (cause: unknown) => {
        if (state.disposed) return
        const message = cause instanceof Error ? cause.message : String(cause)
        state.hostCallError = new HostCallError({ message: `llm() host call failed: ${message}`, cause })
        const errorHandle = context.newError(message)
        context.setProp(errorHandle, "name", context.newString(HOST_CALL_ERROR_NAME))
        deferred.reject(errorHandle)
        errorHandle.dispose()
      },
    )
    deferred.settled.then(() => {
      if (state.disposed) return
      runtime.executePendingJobs()
    })

    return deferred.handle
  })
  context.setProp(context.global, "__hostLlm", fn)
  fn.dispose()
}

const WALL_CLOCK_TIMEOUT = Symbol("wall-clock-timeout")

const raceWallClock = async <T>(work: Promise<T>, remainingMs: number): Promise<T | typeof WALL_CLOCK_TIMEOUT> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<typeof WALL_CLOCK_TIMEOUT>((resolve) => {
        timer = setTimeout(() => resolve(WALL_CLOCK_TIMEOUT), Math.max(0, remainingMs))
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

const disposeQuietly = (disposable: { dispose(): void }): void => {
  try {
    disposable.dispose()
  } catch {
    // A pathological abort path (wall-clock timeout with host calls in
    // flight) can leave live handles behind; leaking one context there is
    // preferable to crashing the worker.
  }
}

export const createQuickJsScriptRuntime = (): ScriptRuntimeShape => {
  const validatedSourceHashes = new Set<string>()

  const compileScript = async (input: { source: string; capabilities?: readonly "llm"[] }) => {
    const QuickJS = await getQuickJS()
    const contentHash = await sha256Hex(input.source)

    if (!validatedSourceHashes.has(contentHash)) {
      const runtime = QuickJS.newRuntime()
      const context = runtime.newContext()
      try {
        const result = context.evalCode(wrapScriptSource(input.source), SCRIPT_FILENAME, { compileOnly: true })
        if (result.error) {
          const dumped: unknown = context.dump(result.error)
          result.error.dispose()
          throw new ScriptCompileError({ message: formatQuickJsError(dumped) })
        }
        result.value.dispose()
      } finally {
        disposeQuietly(context)
        disposeQuietly(runtime)
      }

      if (validatedSourceHashes.size >= COMPILE_CACHE_MAX_ENTRIES) validatedSourceHashes.clear()
      validatedSourceHashes.add(contentHash)
    }

    return {
      source: input.source,
      contentHash,
      capabilities: resolveScriptCapabilities({ source: input.source, declared: input.capabilities }),
    } satisfies CompiledScript
  }

  const runScript = async (input: ScriptRunInput): Promise<RunResult> => {
    const QuickJS = await getQuickJS()
    const limits =
      input.limits ??
      (hasLlmCapability(input.script.capabilities) ? DEFAULT_LLM_SCRIPT_LIMITS : DEFAULT_PURE_SCRIPT_LIMITS)

    const state: RunState = {
      disposed: false,
      trippedLimit: null,
      tokens: 0,
      cost: 0,
      hostCallError: null,
    }

    const startedAt = performance.now()
    const deadline = Date.now() + limits.wallTimeMs

    const runtime = QuickJS.newRuntime()
    runtime.setMemoryLimit(limits.memoryBytes)
    runtime.setMaxStackSize(limits.stackSizeBytes)
    let ticks = 0
    runtime.setInterruptHandler(() => {
      ticks += 1
      if (ticks > limits.cpuTicks) {
        state.trippedLimit = "cpu"
        return true
      }
      if (Date.now() > deadline) {
        state.trippedLimit = "wall-clock"
        return true
      }
      return false
    })

    const context = runtime.newContext()
    try {
      if (input.llm !== undefined && hasLlmCapability(input.script.capabilities)) {
        installHostLlm(context, runtime, state, input.llm)
      }
      installHostParse(context)

      const contextData = jsonToHandle(context, {
        conversation: input.context.conversation,
        ...(input.context.issue !== undefined ? { issue: input.context.issue } : {}),
        ...(input.context.signal !== undefined ? { signal: input.context.signal } : {}),
      })
      context.setProp(context.global, "__contextData", contextData)
      contextData.dispose()

      const preludeResult = context.evalCode(SANDBOX_PRELUDE, PRELUDE_FILENAME)
      context.unwrapResult(preludeResult).dispose()

      const evalResult = context.evalCode(wrapScriptSource(input.script.source), SCRIPT_FILENAME)
      if (evalResult.error) {
        const dumped: unknown = context.dump(evalResult.error)
        evalResult.error.dispose()
        throw mapThrownError(state, limits, dumped)
      }

      const promiseHandle = evalResult.value
      const settledPromise = context.resolvePromise(promiseHandle)
      runtime.executePendingJobs()

      const settled = await raceWallClock(settledPromise, deadline - Date.now())
      promiseHandle.dispose()
      if (settled === WALL_CLOCK_TIMEOUT) {
        state.trippedLimit = "wall-clock"
        throw toLimitError("wall-clock", limits)
      }
      if (settled.error) {
        const dumped: unknown = context.dump(settled.error)
        settled.error.dispose()
        throw mapThrownError(state, limits, dumped)
      }

      const returned: unknown = context.dump(settled.value)
      settled.value.dispose()

      if (typeof returned !== "object" || returned === null || !("__latitudeScore" in returned)) {
        throw new ScriptRuntimeError({
          message: "Script must return Score(value, feedback?) — or the Passed/Failed sugar",
        })
      }
      const raw = returned as { value?: unknown; feedback?: unknown }
      const score = scriptScoreSchema.parse({
        value: raw.value,
        ...(raw.feedback !== undefined ? { feedback: raw.feedback } : {}),
      })

      const duration = Math.max(0, Math.round((performance.now() - startedAt) * 1_000_000))
      return runResultSchema.parse({
        value: score.value,
        ...(score.feedback !== undefined ? { feedback: score.feedback } : {}),
        duration,
        tokens: Math.round(state.tokens),
        cost: Math.round(state.cost),
      })
    } catch (error) {
      if (
        error instanceof ScriptRuntimeError ||
        error instanceof ScriptLimitExceededError ||
        error instanceof HostCallError
      ) {
        throw error
      }
      // Engine failures that unwound across the WASM boundary as host
      // exceptions (e.g. native stack exhaustion) still die by budget.
      throw mapThrownError(state, limits, error instanceof Error ? { name: error.name, message: error.message } : error)
    } finally {
      state.disposed = true
      disposeQuietly(context)
      disposeQuietly(runtime)
    }
  }

  const toRunError = (error: unknown): ScriptRunError => {
    if (
      error instanceof ScriptRuntimeError ||
      error instanceof ScriptLimitExceededError ||
      error instanceof HostCallError
    ) {
      return error
    }
    return new ScriptRuntimeError({
      message: error instanceof Error ? error.message : "Sandbox run failed",
      cause: error,
    })
  }

  return {
    compile: (input) =>
      Effect.tryPromise({
        try: () => compileScript(input),
        catch: (error) =>
          error instanceof ScriptCompileError
            ? error
            : new ScriptCompileError({ message: error instanceof Error ? error.message : "Script compilation failed" }),
      }),
    run: (input) =>
      Effect.tryPromise({
        try: () => runScript(input),
        catch: toRunError,
      }),
  }
}

export const QuickJsScriptRuntimeLive = Layer.succeed(ScriptRuntime, createQuickJsScriptRuntime())
