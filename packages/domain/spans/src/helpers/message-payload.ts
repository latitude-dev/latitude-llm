/**
 * Conversation content out of an opaque `input`/`output` payload.
 *
 * Two sinks need this. OTEL's `input.value`/`output.value` convention (OpenInference, CrewAI)
 * carries a whole exchange in one attribute, and a trace import reads a vendor's own `input`
 * and `output` columns, which are the same thing under a different name. Both end up handing
 * an unknown JSON blob to `rosetta-ai`, so the extraction and translation primitives live here
 * and each caller keeps its own policy for what to do with a payload that holds no messages.
 */
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { Provider, safeTranslate } from "rosetta-ai"
import { normalizeGenAIMessages } from "./normalize-genai-messages.ts"

/** One side of an exchange, plus any system instructions lifted out of its messages. */
interface TranslatedMessages {
  readonly messages: readonly GenAIMessage[]
  readonly system: GenAISystem
}

interface ParsedMessagePayload {
  readonly inputMessages: readonly GenAIMessage[]
  readonly outputMessages: readonly GenAIMessage[]
  readonly systemInstructions: GenAISystem
}

const EMPTY_TRANSLATION: TranslatedMessages = { messages: [], system: [] }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

const hasStringRole = (value: unknown): value is Record<string, unknown> =>
  isRecord(value) && typeof value.role === "string"

/** Only containers are worth parsing: a bare sentence is content, not encoded JSON. */
const parsedJson = (raw: unknown): unknown => {
  if (typeof raw !== "string") return raw
  const trimmed = raw.trim()
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return raw
  try {
    return JSON.parse(trimmed)
  } catch {
    return raw
  }
}

/**
 * The `messages` array a payload holds, or `undefined` when it holds none.
 *
 * Accepts a JSON string, a bare array or a `{ messages: [...] }` container. Every entry must
 * carry a string `role`: that is what tells a conversation apart from an arbitrary blob that
 * merely happens to be an array, and translating the latter yields roleless messages rather
 * than the "this is not a conversation" answer the callers need.
 *
 * Deliberately *not* a lone message object. One `{ role, content }` is a conversation to a
 * trace import, whose alternative is rendering the payload as text, but to ingest it is any
 * object that happens to have a `role` key — an authorization blob under `input.value` would
 * become a message with `role: "admin"`, outside the role vocabulary entirely. The import
 * policy widens this in `parseMessagePayload`; the shared primitive stays strict.
 */
export const extractMessages = (raw: unknown): Record<string, unknown>[] | undefined => {
  const value = parsedJson(raw)

  const candidate = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.messages)
      ? value.messages
      : undefined

  if (!candidate || candidate.length === 0) return undefined
  return candidate.every(hasStringRole) ? (candidate as Record<string, unknown>[]) : undefined
}

/** `extractMessages`, plus the lone `{ role, content }` object a source records per span. */
const extractImportedMessages = (raw: unknown): Record<string, unknown>[] | undefined => {
  const messages = extractMessages(raw)
  if (messages) return messages

  const value = parsedJson(raw)
  return hasStringRole(value) ? [value] : undefined
}

/**
 * The provider order `rosetta-ai` tries when inferring a payload's format.
 *
 * Its own default puts OpenAI Completions first and GenAI sixth, which loses every GenAI payload
 * whose messages are assistant-only — `gen_ai.output.messages` always is. Such an array parses as a
 * legal OpenAI assistant message, because OpenAI allows an assistant turn with no `content` and
 * passes unknown keys through, so `parts` reads as an unrecognised field and the whole conversation
 * lands in provider metadata instead of the message.
 *
 * GenAI first fixes that and costs nothing: it is the strictest of the schemas, so a payload in any
 * other dialect fails it and falls through to exactly the same answer as before.
 */
const INFER_PRIORITY = [
  Provider.GenAI,
  Provider.OpenAICompletions,
  Provider.OpenAIResponses,
  Provider.Anthropic,
  Provider.Google,
  Provider.VercelAI,
  Provider.Promptl,
  Provider.Compat,
]

/**
 * An empty `parts` dropped from a message that carries `content` beside it.
 *
 * The two spellings together are neither dialect cleanly, and `parts` is the stronger signal, so
 * inference answers GenAI and translates the message to the empty `parts` it already had — losing
 * the `content` that held the text. litellm emits exactly this envelope. Dropping the empty array
 * leaves the message as the `{role, content}` it effectively is, which infers as the dialect that
 * can read it. A GenAI message legitimately holding no parts has no `content` key to keep.
 */
const withoutEmptyParts = (message: Record<string, unknown>): Record<string, unknown> => {
  if (!Array.isArray(message.parts) || message.parts.length > 0 || message.content === undefined) return message
  const { parts: _parts, ...rest } = message
  return rest
}

/**
 * Messages translated to Latitude's GenAI shape, with the source convention inferred.
 *
 * A failure degrades to no messages rather than propagating: content is the one part of a span
 * that can be missing without making the span itself wrong, and both callers store the raw
 * payload elsewhere.
 */
export const translateMessages = (
  messages: readonly Record<string, unknown>[],
  direction: "input" | "output",
): TranslatedMessages => {
  if (messages.length === 0) return EMPTY_TRANSLATION

  const result = safeTranslate(messages.map(withoutEmptyParts) as object[], {
    direction,
    inferPriority: INFER_PRIORITY,
  })
  if (result.error) return EMPTY_TRANSLATION

  // Normalized after translating, and whatever dialect it came from. After, because a GenAI-to-GenAI
  // translation is an identity pass that drops `_provider_metadata`, so a tool name moved into known
  // fields ahead of it would not survive. Whatever the dialect, because a part type this rewrites is
  // non-conformant wherever it came from — a provider that names inline binary data `binary` reaches
  // the OpenAI translator unrecognised and passes straight through it.
  return {
    messages: normalizeGenAIMessages(result.messages as GenAIMessage[]),
    system: result.system ?? [],
  }
}

/**
 * Splits one array holding a whole exchange: the trailing assistant turn is the output.
 *
 * Sources that record a single conversation rather than a request and a response put the
 * model's reply at the end of it, so anything before that is what the model was given.
 */
export const translateCombinedMessages = (messages: readonly Record<string, unknown>[]): ParsedMessagePayload => {
  const splitAt = messages[messages.length - 1]?.role === "assistant" ? messages.length - 1 : messages.length
  const input = translateMessages(messages.slice(0, splitAt), "input")
  const output = translateMessages(messages.slice(splitAt), "output")

  return { inputMessages: input.messages, outputMessages: output.messages, systemInstructions: input.system }
}

/** A payload that carries nothing, so the other side may hold the whole exchange. */
const isBlank = (value: unknown): boolean => {
  if (value === null || value === undefined) return true
  if (typeof value === "string") return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  return isRecord(value) && Object.keys(value).length === 0
}

/** Text for a payload that holds no conversation, so its content survives as a message. */
export const stringifyPayload = (value: unknown): string => {
  if (value === null || value === undefined) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value)
  try {
    return JSON.stringify(value) ?? ""
  } catch {
    return ""
  }
}

const textMessage = (role: GenAIMessage["role"], content: string): GenAIMessage => ({
  role,
  parts: [{ type: "text", content }],
})

const asMessages = (
  payload: unknown,
  role: GenAIMessage["role"],
  direction: "input" | "output",
): TranslatedMessages => {
  const messages = extractImportedMessages(payload)
  if (messages) return translateMessages(messages, direction)
  if (isBlank(payload)) return EMPTY_TRANSLATION

  // Not a conversation, so keep it as text under the side's own role. An import has nowhere
  // else to put it: unlike ingest, there is no attribute bag left holding the raw payload.
  const content = stringifyPayload(payload)
  return content ? { messages: [textMessage(role, content)], system: [] } : EMPTY_TRANSLATION
}

/**
 * Content from the `input` and `output` a source records per span.
 *
 * Each side is translated on its own, except when one is empty and the other holds a whole
 * exchange — the shape a source takes when it logs one conversation per span rather than a
 * request and a response.
 */
export const parseMessagePayload = (payload: {
  readonly input: unknown
  readonly output: unknown
}): ParsedMessagePayload => {
  const inputMessages = extractImportedMessages(payload.input)
  const outputMessages = extractImportedMessages(payload.output)

  if (inputMessages && !outputMessages && isBlank(payload.output)) return translateCombinedMessages(inputMessages)
  if (outputMessages && !inputMessages && isBlank(payload.input)) return translateCombinedMessages(outputMessages)

  const input = asMessages(payload.input, "user", "input")
  const output = asMessages(payload.output, "assistant", "output")

  return {
    inputMessages: input.messages,
    outputMessages: output.messages,
    systemInstructions: input.system,
  }
}
