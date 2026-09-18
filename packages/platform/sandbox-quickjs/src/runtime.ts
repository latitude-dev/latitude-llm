import {
  buildSchemaFromDescriptor,
  type CompiledScript,
  DEFAULT_EMBEDDING_SCRIPT_LIMITS,
  DEFAULT_LLM_SCRIPT_LIMITS,
  DEFAULT_PURE_SCRIPT_LIMITS,
  HostCallError,
  type HostClassifierFunction,
  type HostLlmFunction,
  type HostSimilarityFunction,
  hasClassifierCapability,
  hasEmbeddingCapability,
  hasLlmCapability,
  type RunResult,
  resolveScriptCapabilities,
  runResultSchema,
  type ScriptCapability,
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
  // Only trust the HostCallError name when a host call actually failed in
  // this run — a script setting `error.name` cannot masquerade its own
  // deterministic throw as a transient (retryable) host failure.
  if (erroredName === HOST_CALL_ERROR_NAME && state.hostCallError !== null) {
    return state.hostCallError
  }

  return new ScriptRuntimeError({ message })
}

/**
 * Evaluates a JSON-safe host value into the context as a fresh handle.
 * Goes through in-context `JSON.parse` (not an object-literal eval) so a
 * `"__proto__"` key stays an own data property instead of becoming a
 * prototype assignment.
 */
const jsonToHandle = (context: QuickJSContext, value: unknown): QuickJSHandle => {
  const json = JSON.stringify(value ?? null)
  const result = context.evalCode(`JSON.parse(${JSON.stringify(json)})`)
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

    // Validate the descriptor synchronously, before any host work: a missing
    // or forged schema is a deterministic script bug and must surface as a
    // script-side throw (→ ScriptRuntimeError), never as a transient
    // HostCallError that the retry policy would replay.
    const descriptor = schemaDescriptorSchema.safeParse(call.schema)
    if (!descriptor.success) {
      throw new Error("llm() requires a schema built with the z global")
    }
    const schema = descriptor.data

    const deferred = context.newPromise()

    hostLlm({ prompt: call.prompt, schema }).then(
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

const installHostSimilarity = (
  context: QuickJSContext,
  runtime: QuickJSRuntime,
  state: RunState,
  hostSimilarity: HostSimilarityFunction,
): void => {
  const fn = context.newFunction("__hostSimilarity", (callHandle) => {
    const rawCall: unknown = callHandle === undefined ? undefined : context.dump(callHandle)
    const call = rawCall as { query?: unknown }

    // A non-string query is a deterministic script bug — surface it as a
    // script-side throw before any host work, never a transient HostCallError.
    if (typeof call.query !== "string") {
      throw new Error("semanticSimilarity() requires a string query")
    }
    const query = call.query

    const deferred = context.newPromise()

    hostSimilarity({ query }).then(
      (result) => {
        if (state.disposed) return
        state.tokens += result.tokens
        state.cost += result.cost
        const handle = jsonToHandle(context, result.similarity)
        deferred.resolve(handle)
        handle.dispose()
      },
      (cause: unknown) => {
        if (state.disposed) return
        const message = cause instanceof Error ? cause.message : String(cause)
        state.hostCallError = new HostCallError({
          message: `semanticSimilarity() host call failed: ${message}`,
          cause,
        })
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
  context.setProp(context.global, "__hostSimilarity", fn)
  fn.dispose()
}

const installHostClassifier = (
  context: QuickJSContext,
  runtime: QuickJSRuntime,
  state: RunState,
  hostClassifier: HostClassifierFunction,
): void => {
  const fn = context.newFunction("__hostClassifier", (callHandle) => {
    const rawCall: unknown = callHandle === undefined ? undefined : context.dump(callHandle)
    const call = rawCall as { instructions?: unknown; criteria?: unknown }
    const validCriteria = typeof call.criteria === "object" && call.criteria !== null && !Array.isArray(call.criteria)
    if (typeof call.instructions !== "string" || !validCriteria) {
      throw new Error("classify() requires string instructions and an options object")
    }

    const criteria = call.criteria as Record<string, unknown>
    const validOptions =
      Object.keys(criteria).length >= 2 &&
      Object.values(criteria).every((description) => typeof description === "string" || description === null)
    if (!validOptions) throw new Error("classify() requires at least two string or null options")

    const deferred = context.newPromise()
    hostClassifier({ instructions: call.instructions, criteria: criteria as Record<string, string | null> }).then(
      (result) => {
        if (state.disposed) return
        state.tokens += result.tokens
        state.cost += result.cost
        const handle = jsonToHandle(context, result.probabilities)
        deferred.resolve(handle)
        handle.dispose()
      },
      (cause: unknown) => {
        if (state.disposed) return
        const message = cause instanceof Error ? cause.message : String(cause)
        state.hostCallError = new HostCallError({ message: `classify() host call failed: ${message}`, cause })
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
  context.setProp(context.global, "__hostClassifier", fn)
  fn.dispose()
}

interface RunCapabilities {
  readonly llm: boolean
  readonly embedding: boolean
  readonly classifier: boolean
}

const validateRunCapabilities = (input: ScriptRunInput): RunCapabilities => {
  const capabilities = {
    llm: hasLlmCapability(input.script.capabilities),
    embedding: hasEmbeddingCapability(input.script.capabilities),
    classifier: hasClassifierCapability(input.script.capabilities),
  }
  if (capabilities.llm && input.llm === undefined) {
    throw new ScriptRuntimeError({ message: "llm-capability script was run without a host llm implementation" })
  }
  if (capabilities.embedding && input.similarity === undefined) {
    throw new ScriptRuntimeError({
      message: "embedding-capability script was run without a host similarity implementation",
    })
  }
  if (capabilities.classifier && input.classifier === undefined) {
    throw new ScriptRuntimeError({
      message: "classifier-capability script was run without a host classifier implementation",
    })
  }
  return capabilities
}

const defaultLimitsForCapabilities = (capabilities: RunCapabilities): ScriptRunLimits => {
  if (capabilities.llm || capabilities.classifier) return DEFAULT_LLM_SCRIPT_LIMITS
  if (capabilities.embedding) return DEFAULT_EMBEDDING_SCRIPT_LIMITS
  return DEFAULT_PURE_SCRIPT_LIMITS
}

const installHostBridges = (input: {
  readonly context: QuickJSContext
  readonly runtime: QuickJSRuntime
  readonly state: RunState
  readonly run: ScriptRunInput
  readonly capabilities: RunCapabilities
}): void => {
  if (input.run.llm !== undefined && input.capabilities.llm) {
    installHostLlm(input.context, input.runtime, input.state, input.run.llm)
  }
  if (input.run.similarity !== undefined && input.capabilities.embedding) {
    installHostSimilarity(input.context, input.runtime, input.state, input.run.similarity)
  }
  if (input.run.classifier !== undefined && input.capabilities.classifier) {
    installHostClassifier(input.context, input.runtime, input.state, input.run.classifier)
  }
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

  const compileScript = async (input: { source: string; capabilities?: readonly ScriptCapability[] }) => {
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
    const capabilities = validateRunCapabilities(input)

    const QuickJS = await getQuickJS()
    const limits = input.limits ?? defaultLimitsForCapabilities(capabilities)

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
      installHostBridges({ context, runtime, state, run: input, capabilities })
      installHostParse(context)

      const contextData = jsonToHandle(context, { session: input.context.session })
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
        // An in-flight AI host call keeps running detached after this
        // (its callbacks are guarded by state.disposed); tokens it still
        // consumes are not metered into this RunResult — accepted
        // cost-accounting slack on an already-errored run.
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

// Pre-warm the WASM module at layer construction so a load failure
// surfaces as a worker startup defect rather than a ScriptCompileError.
export const QuickJsScriptRuntimeLive = Layer.effect(
  ScriptRuntime,
  Effect.tryPromise({
    try: async () => {
      await getQuickJS()
      return createQuickJsScriptRuntime()
    },
    catch: (error) =>
      new Error(`QuickJS WASM initialization failed: ${error instanceof Error ? error.message : String(error)}`),
  }).pipe(Effect.orDie),
)
