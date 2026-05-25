export const sandboxWorkerSource = `(${sandboxWorkerMain.toString()})()`

function sandboxWorkerMain() {
  const { parentPort, workerData } = require("node:worker_threads") as typeof import("node:worker_threads")
  const vm = require("node:vm") as typeof import("node:vm")
  type HostResponseMessage =
    | { readonly type: "response"; readonly id: number; readonly ok: true; readonly value: unknown }
    | { readonly type: "response"; readonly id: number; readonly ok: false; readonly error?: string }

  type WorkerData = {
    readonly script: string
    readonly conversation: unknown
    readonly metadata: unknown
    readonly issue: unknown
    readonly jsonSchemaValidatorPath: string
    readonly syncTimeoutMs: number
  }

  if (!parentPort) throw new Error("Evaluation sandbox worker requires a parent port")
  const port = parentPort

  const data = workerData as WorkerData
  const { Validator } = require(data.jsonSchemaValidatorPath) as typeof import("@cfworker/json-schema")
  let requestId = 0
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>()

  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value)
  }

  function toPlainJson<T>(value: T): T {
    const serialized = JSON.stringify(value)
    if (serialized === undefined) throw new Error("Evaluation runtime values must be JSON-serializable")
    return JSON.parse(serialized) as T
  }

  function isHostResponseMessage(message: unknown): message is HostResponseMessage {
    if (!isRecord(message)) return false
    return message.type === "response" && typeof message.id === "number" && typeof message.ok === "boolean"
  }

  port.on("message", (message: unknown) => {
    if (!isHostResponseMessage(message)) return

    const entry = pending.get(message.id)
    if (!entry) return

    pending.delete(message.id)
    if (message.ok) entry.resolve(toPlainJson(message.value))
    else entry.reject(new Error(message.error || "Evaluation runtime host call failed"))
  })

  function hostCall(method: string, payload: unknown) {
    const id = ++requestId
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject })
      port.postMessage(toPlainJson({ type: "request", id, method, payload }))
    })
  }

  function formatConversationForPrompt(conversation: unknown): string {
    // Keep this in sync with domain-side formatEvaluationConversationForPrompt; sandbox source must stay standalone.
    if (!Array.isArray(conversation)) return ""

    return conversation
      .map((message) => {
        if (!isRecord(message)) return `[unknown] ${String(message)}`

        const role = typeof message.role === "string" ? message.role : "unknown"
        const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? "")
        return `[${role}] ${content}`
      })
      .join("\n")
  }

  function validateJson(value: unknown, schema: unknown): unknown {
    type JsonSchema = import("@cfworker/json-schema").Schema | boolean

    const plainSchema = toPlainJson(schema) as JsonSchema
    const plainValue = toPlainJson(value)
    const validator = new Validator(plainSchema, "2020-12", false)
    const result = validator.validate(plainValue)

    if (!result.valid) {
      const message = result.errors.map((error) => `${error.instanceLocation || "$"}: ${error.error}`).join("; ")
      throw new Error(message || "JSON Schema validation failed")
    }

    return plainValue
  }

  function toScore(passed: boolean, scoreOrFeedback: unknown, maybeFeedback: unknown) {
    // `passed` is the verdict; an explicit score allows partial credit/confidence such as Passed(0.5, "...").
    const hasExplicitScore = typeof scoreOrFeedback === "number"
    const value = hasExplicitScore ? scoreOrFeedback : passed ? 1 : 0
    const feedback = hasExplicitScore ? maybeFeedback : scoreOrFeedback

    if (typeof feedback !== "string" || feedback.trim().length === 0) {
      throw new Error("Evaluation score feedback is required")
    }

    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error("Evaluation score value must be between 0 and 1")
    }

    return { passed, value, feedback }
  }

  const conversation = toPlainJson(data.conversation)
  const context = vm.createContext({
    conversation,
    conversationText: formatConversationForPrompt(conversation),
    metadata: toPlainJson(data.metadata),
    issue: toPlainJson(data.issue),
    Passed: (scoreOrFeedback: unknown, maybeFeedback: unknown) => toScore(true, scoreOrFeedback, maybeFeedback),
    Failed: (scoreOrFeedback: unknown, maybeFeedback: unknown) => toScore(false, scoreOrFeedback, maybeFeedback),
    llm: (prompt: unknown, options: unknown = {}) => {
      if (typeof prompt !== "string") throw new Error("llm(prompt) requires a string prompt")
      if (!isRecord(options)) throw new Error("llm options must be an object")

      return hostCall("llm", {
        prompt,
        schema: options.schema ?? null,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
      })
    },
    parse: (value: unknown, schema: unknown) => validateJson(value, schema),
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Array,
    Object,
  })

  async function main() {
    const source = `"use strict"; (async () => { const __result = await (async function evaluate() {\n${data.script}\n})(); return __result; })()`
    const compiled = new vm.Script(source, { filename: "evaluation-script.js" })
    const result = await compiled.runInContext(context, { timeout: data.syncTimeoutMs })
    const validated = validateJson(result, {
      type: "object",
      additionalProperties: false,
      required: ["passed", "value", "feedback"],
      properties: {
        passed: { type: "boolean" },
        value: { type: "number", minimum: 0, maximum: 1 },
        feedback: { type: "string", minLength: 1 },
      },
    })
    port.postMessage(toPlainJson({ type: "result", result: validated }))
  }

  main().catch((error: unknown) => {
    port.postMessage(toPlainJson({ type: "error", error: error instanceof Error ? error.message : String(error) }))
  })
}
