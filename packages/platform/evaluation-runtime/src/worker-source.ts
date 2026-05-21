export const workerSource = String.raw`
const { parentPort, workerData } = require("node:worker_threads")
const vm = require("node:vm")

let requestId = 0
const pending = new Map()

parentPort.on("message", (message) => {
  if (!message || typeof message !== "object") return
  if (message.type === "response") {
    const entry = pending.get(message.id)
    if (!entry) return
    pending.delete(message.id)
    if (message.ok) entry.resolve(message.value)
    else entry.reject(new Error(message.error || "Evaluation runtime host call failed"))
  }
})

function hostCall(method, payload) {
  const id = ++requestId
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    parentPort.postMessage({ type: "request", id, method, payload })
  })
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function validateJsonSchema(value, schema, path = "$") {
  if (!isRecord(schema)) throw new Error("JSON Schema must be an object")
  const type = schema.type
  if (schema.const !== undefined && value !== schema.const) throw new Error(path + " must equal the schema const")
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) throw new Error(path + " must match one of the enum values")

  switch (type) {
    case "object": {
      if (!isRecord(value)) throw new Error(path + " must be an object")
      const properties = isRecord(schema.properties) ? schema.properties : {}
      const required = Array.isArray(schema.required) ? schema.required : []
      for (const key of required) {
        if (!(key in value)) throw new Error(path + "." + key + " is required")
      }
      for (const [key, child] of Object.entries(properties)) {
        if (value[key] !== undefined) validateJsonSchema(value[key], child, path + "." + key)
      }
      if (schema.additionalProperties === false) {
        for (const key of Object.keys(value)) {
          if (!(key in properties)) throw new Error(path + "." + key + " is not allowed")
        }
      }
      return value
    }
    case "array": {
      if (!Array.isArray(value)) throw new Error(path + " must be an array")
      if (schema.items !== undefined) value.forEach((item, index) => validateJsonSchema(item, schema.items, path + "[" + index + "]"))
      return value
    }
    case "string": {
      if (typeof value !== "string") throw new Error(path + " must be a string")
      if (schema.minLength !== undefined && value.length < schema.minLength) throw new Error(path + " is too short")
      if (schema.maxLength !== undefined && value.length > schema.maxLength) throw new Error(path + " is too long")
      return value
    }
    case "number":
    case "integer": {
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(path + " must be a number")
      if (type === "integer" && !Number.isInteger(value)) throw new Error(path + " must be an integer")
      if (schema.minimum !== undefined && value < schema.minimum) throw new Error(path + " is below minimum")
      if (schema.maximum !== undefined && value > schema.maximum) throw new Error(path + " is above maximum")
      return value
    }
    case "boolean": {
      if (typeof value !== "boolean") throw new Error(path + " must be a boolean")
      return value
    }
    case "null": {
      if (value !== null) throw new Error(path + " must be null")
      return value
    }
    default:
      throw new Error("Unsupported JSON Schema type at " + path + ": " + String(type))
  }
}

function toScore(passed, scoreOrFeedback, maybeFeedback) {
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

const context = vm.createContext({
  conversation: workerData.conversation,
  conversationText: workerData.conversationText,
  metadata: workerData.metadata,
  issue: workerData.issue,
  Passed: (scoreOrFeedback, maybeFeedback) => toScore(true, scoreOrFeedback, maybeFeedback),
  Failed: (scoreOrFeedback, maybeFeedback) => toScore(false, scoreOrFeedback, maybeFeedback),
  llm: (prompt, options = {}) => {
    if (typeof prompt !== "string") throw new Error("llm(prompt) requires a string prompt")
    if (!isRecord(options)) throw new Error("llm options must be an object")
    return hostCall("llm", {
      prompt,
      schema: options.schema ?? null,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    })
  },
  parse: (value, schema) => validateJsonSchema(value, schema),
  JSON,
  Math,
  Number,
  String,
  Boolean,
  Array,
  Object,
})

async function main() {
  const source = "\"use strict\"; (async () => { const __result = await (async function evaluate() {\n" + workerData.script + "\n})(); return __result; })()"
  const compiled = new vm.Script(source, { filename: "evaluation-script.js" })
  const result = await compiled.runInContext(context, { timeout: workerData.syncTimeoutMs })
  validateJsonSchema(result, {
    type: "object",
    additionalProperties: false,
    required: ["passed", "value", "feedback"],
    properties: {
      passed: { type: "boolean" },
      value: { type: "number", minimum: 0, maximum: 1 },
      feedback: { type: "string", minLength: 1 },
    },
  })
  parentPort.postMessage({ type: "result", result })
}

main().catch((error) => {
  parentPort.postMessage({ type: "error", error: error instanceof Error ? error.message : String(error) })
})
`
