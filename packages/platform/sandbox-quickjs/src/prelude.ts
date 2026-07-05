/**
 * Host-controlled globals evaluated into every QuickJS context before the
 * script body runs. The prelude consumes (and deletes) three bootstrap
 * globals installed by the runtime:
 *
 * - `__hostLlm(call)`        — async host bridge behind `llm()` (only for llm-capability runs)
 * - `__hostSimilarity(call)` — async host bridge behind `semanticSimilarity()` (embedding-capability runs)
 * - `__hostParse(v, d)`      — sync host bridge behind `parse()` (real Zod runs host-side)
 * - `__contextData`          — `{ session }` plain data (the only runtime context)
 *
 * The `z` builders produce serializable schema descriptors (see
 * `@domain/sandbox` `schema-descriptor.ts`), not real Zod schemas: schemas
 * only exist to cross the boundary into `llm()` and `parse()`, both performed
 * by the host. `session.conversation` stringifies as `[role] content` lines so
 * judge templates interpolating `${session.conversation}` keep their exact prompt.
 */
export const SANDBOX_PRELUDE = `;(() => {
  "use strict"
  const hostLlm = globalThis.__hostLlm
  const hostSimilarity = globalThis.__hostSimilarity
  const hostParse = globalThis.__hostParse
  const bootstrap = globalThis.__contextData
  delete globalThis.__hostLlm
  delete globalThis.__hostSimilarity
  delete globalThis.__hostParse
  delete globalThis.__contextData

  const toScore = (value, feedback) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError("Score value must be a finite number")
    }
    if (value < 0 || value > 1) {
      throw new RangeError("Score value must be between 0 and 1")
    }
    if (feedback !== undefined && typeof feedback !== "string") {
      throw new TypeError("Score feedback must be a string")
    }
    const score = { __latitudeScore: true, value }
    if (feedback !== undefined) score.feedback = feedback
    return Object.freeze(score)
  }
  globalThis.Score = (value, feedback) => toScore(value, feedback)
  globalThis.Passed = (value, feedback) => toScore(value ?? 1, feedback)
  globalThis.Failed = (value, feedback) => toScore(value ?? 0, feedback)

  const strip = (value) => JSON.parse(JSON.stringify(value))

  const schemaNode = (node) => {
    const api = {
      optional: () => schemaNode({ ...node, optional: true }),
      nullable: () => schemaNode({ ...node, nullable: true }),
      describe: (description) => schemaNode({ ...node, description: String(description) }),
    }
    if (node.kind === "string") {
      api.min = (minLength) => schemaNode({ ...node, minLength })
      api.max = (maxLength) => schemaNode({ ...node, maxLength })
    }
    if (node.kind === "number") {
      api.min = (min) => schemaNode({ ...node, min })
      api.max = (max) => schemaNode({ ...node, max })
      api.int = () => schemaNode({ ...node, int: true })
    }
    return Object.freeze({ ...node, ...api })
  }

  const z = Object.freeze({
    string: () => schemaNode({ kind: "string" }),
    number: () => schemaNode({ kind: "number" }),
    boolean: () => schemaNode({ kind: "boolean" }),
    literal: (value) => schemaNode({ kind: "literal", value }),
    enum: (values) => schemaNode({ kind: "enum", values: strip(values) }),
    array: (element) => schemaNode({ kind: "array", element: strip(element) }),
    object: (shape) => schemaNode({ kind: "object", shape: strip(shape) }),
    union: (options) => schemaNode({ kind: "union", options: strip(options) }),
  })
  globalThis.z = z
  const zodModule = Object.freeze({ ...z, z })
  globalThis.require = (moduleName) => {
    if (moduleName === "zod" || moduleName === "zod/v4") return zodModule
    throw new TypeError('require() is unavailable in the sandbox for module "' + String(moduleName) + '"')
  }

  if (hostParse) {
    globalThis.parse = (value, schema) => hostParse(value, strip(schema))
  }
  if (hostLlm) {
    globalThis.llm = (prompt, options) => {
      if (!options || !options.schema) {
        throw new TypeError("llm() requires a schema: llm(prompt, { schema: z.object({ ... }) })")
      }
      return hostLlm({ prompt: String(prompt), schema: strip(options.schema) })
    }
  }
  if (hostSimilarity) {
    globalThis.semanticSimilarity = (query) => {
      if (typeof query !== "string") {
        throw new TypeError("semanticSimilarity() requires a string query")
      }
      return hostSimilarity({ query: String(query) })
    }
  }

  const deepFreeze = (value) => {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.freeze(value)
      for (const key of Object.keys(value)) deepFreeze(value[key])
    }
    return value
  }

  const session = (bootstrap && bootstrap.session) || { conversation: [], traces: [] }
  const conversation = session.conversation || []
  Object.defineProperty(conversation, "toString", {
    value: () => conversation.map((message) => "[" + message.role + "] " + message.content).join("\\n"),
  })
  session.conversation = conversation
  // Deep-freeze the whole payload so a script cannot mutate the session (traces, tools, metrics) it reads.
  globalThis.session = deepFreeze(session)
  // Alias for backwards-compatibility: scripts written before session scoping can reference conversation directly.
  globalThis.conversation = session.conversation
})()
`
