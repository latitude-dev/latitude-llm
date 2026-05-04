import {
  AI,
  AI_GENERATE_TELEMETRY_SPAN_NAMES,
  AI_GENERATE_TELEMETRY_TAGS,
  type AICredentialError,
  type AIError,
  buildProjectScopedAiMetadata,
} from "@domain/ai"
import { OrganizationId, ProjectId, type RepositoryError, TraceId } from "@domain/shared"
import { type TraceDetail, TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { FLAGGER_ANNOTATOR_MAX_TOKENS, FLAGGER_ANNOTATOR_MODEL } from "../constants.ts"
import { getFlaggerStrategy } from "../flagger-strategies/index.ts"
import { flaggerAnnotatorOutputSchema } from "./flagger-annotator-contracts.ts"

export interface RunFlaggerAnnotatorInput {
  readonly organizationId: string
  readonly projectId: string
  readonly flaggerSlug: string
  readonly traceId: string
  readonly scoreId: string
}

export interface RunFlaggerAnnotatorResult {
  readonly feedback: string
  readonly traceCreatedAt: string
  readonly sessionId: string | null
  readonly simulationId: string | null
  readonly messageIndex?: number | undefined
}

export type RunFlaggerAnnotatorError = RepositoryError | AIError | AICredentialError

/**
 * Input for the pure annotator (no repository dependency).
 *
 * Callers that already hold a `TraceDetail` use this shape with
 * {@link annotateTraceForFlaggerUseCase}.
 */
export interface AnnotateTraceForFlaggerInput {
  readonly organizationId: string
  readonly projectId: string
  readonly flaggerSlug: string
  readonly traceId: string
  readonly scoreId: string
  readonly trace: TraceDetail
}

const ANNOTATOR_SYSTEM_PROMPT_TEMPLATE = `
You are the Annotation Writer for telemetry traces. Given a flagged trace and the flagger it matched, write a short, human-readable annotation describing the issue detected.
The flag decision has already been made — your job is to draft the annotation, not to re-evaluate whether the trace belongs to this flagger.

Flagger (the trace matched this flagger):
- Name: {flaggerName}
- Description: {flaggerDescription}
- Reviewer guidance for what belongs to this flagger:
{flaggerInstructions}

Format constraints:
- Write ONE to TWO sentences maximum.
- Focus on what went wrong and the key evidence — not an exhaustive analysis.
- Write so that similar issues across different traces produce similar annotations. The text will be used for semantic clustering.
- Do NOT start with generic prefixes like "Trace shows", "The trace", "This trace", "The assistant" — lead with the specific issue or behavior.
- Reference concrete numbers or field values when they strengthen the signal (e.g. "8 tool calls", "18s duration"), but do not enumerate every detail.

Grounding rules:
- Use ONLY the provided inputs. Do not invent facts.
- The conversation is provided as a normalized transcript for annotation. Treat it as factual evidence about what happened, then describe the underlying behavior in natural language.
- If evidence supports only a broad issue, name the issue plainly without speculating about hidden details.
- Do not mention transcript formatting, redaction, omitted payloads, message labels, PromptL, system prompts, or other internal implementation details.

Use the simplest wording that still carries the full meaning. Prefer short, everyday words over formal or technical synonyms when both fit, and keep the feedback only as long as it needs to be — no padding, no restatement, no meta-commentary. The original context and nuance must still come through; simpler wording is the goal, not less information.

Respond with structured data containing a "feedback" field with your annotation text, and an optional "messageIndex" field (integer) pointing to the specific transcript line where the issue is most evident. Each transcript line is prefixed with its message index like \`[m12 assistant]:\`. Only specify messageIndex when you can confidently identify the line — it is better to omit it than to guess. When the transcript shows a toolcall or toolresult line that is the direct evidence, prefer its index.
`.trim()

const SYSTEM_PROMPT_PREVIEW_MAX_LINES = 4
const SYSTEM_PROMPT_PREVIEW_MAX_CHARS = 600
const TOOL_RESULT_ERROR_TEXT = /(^error\b|error:\s*|\bfailed\b|\bfailure\b|\bexception\b|\btimeout\b|\bunavailable\b)/i
const TOOL_RESULT_ERROR_STATUSES = new Set(["error", "failed", "failure"])

const buildAnnotatorSystemPrompt = (flaggerSlug: string): string => {
  const strategy = getFlaggerStrategy(flaggerSlug)
  const annotator = strategy?.annotator

  if (!annotator) {
    return ANNOTATOR_SYSTEM_PROMPT_TEMPLATE.replace("{flaggerName}", flaggerSlug)
      .replace("{flaggerDescription}", "Flagger for pattern detection")
      .replace("{flaggerInstructions}", "Review the conversation and provide feedback.")
  }

  return ANNOTATOR_SYSTEM_PROMPT_TEMPLATE.replace("{flaggerName}", annotator.name)
    .replace("{flaggerDescription}", annotator.description)
    .replace("{flaggerInstructions}", annotator.instructions)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null
}

function cropSystemPromptPreview(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")

  if (lines.length === 0) return ""

  const preview = lines.slice(0, SYSTEM_PROMPT_PREVIEW_MAX_LINES).join(" ")
  const truncated =
    preview.length > SYSTEM_PROMPT_PREVIEW_MAX_CHARS
      ? preview.slice(0, SYSTEM_PROMPT_PREVIEW_MAX_CHARS).trimEnd()
      : preview

  return lines.length > SYSTEM_PROMPT_PREVIEW_MAX_LINES || truncated.length < preview.length
    ? `${truncated}...`
    : truncated
}

function responseIndicatesFailure(response: unknown): boolean {
  if (typeof response === "string") {
    const trimmed = response.trim()
    if (trimmed === "") return false

    try {
      return responseIndicatesFailure(JSON.parse(trimmed))
    } catch {
      return TOOL_RESULT_ERROR_TEXT.test(trimmed)
    }
  }

  if (Array.isArray(response)) {
    return response.some(responseIndicatesFailure)
  }

  if (!isRecord(response)) return false

  if (response.isError === true || response.ok === false || response.success === false) {
    return true
  }

  const status = toNonEmptyString(response.status)
  if (status && TOOL_RESULT_ERROR_STATUSES.has(status.toLowerCase())) {
    return true
  }

  if ("error" in response) {
    const error = response.error
    if (error !== null && error !== undefined && error !== false && error !== "") {
      return true
    }
  }

  if (Array.isArray(response.errors) && response.errors.length > 0) {
    return true
  }

  return false
}

const formatConversationForAnnotator = (messages: readonly { role: string; parts: unknown[] }[]): string => {
  const lines: string[] = []

  for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
    const message = messages[msgIdx]!
    if (message.role === "system") {
      const systemText = message.parts
        .flatMap((part) => {
          if (!isRecord(part) || part.type !== "text") return []
          const content = toNonEmptyString(part.content)
          return content ? [content] : []
        })
        .join("\n")

      const preview = cropSystemPromptPreview(systemText)
      if (preview) lines.push(`[m${msgIdx} system]: ${preview}`)
      continue
    }

    const textParts: string[] = []

    const flushText = () => {
      if (message.role !== "user" && message.role !== "assistant") return

      const body = textParts.join("\n").trim()
      if (body) lines.push(`[m${msgIdx} ${message.role}]: ${body}`)
      textParts.length = 0
    }

    for (const part of message.parts) {
      if (!isRecord(part)) continue

      if (part.type === "text") {
        const content = toNonEmptyString(part.content)
        if (content && (message.role === "user" || message.role === "assistant")) {
          textParts.push(content)
        }
        continue
      }

      if (part.type === "tool_call" || part.type === "tool-call") {
        flushText()
        const toolName = toNonEmptyString(part.name) ?? toNonEmptyString(part.toolName) ?? "<unknown tool>"
        lines.push(`[m${msgIdx} toolcall]: ${toolName}`)
        continue
      }

      if (part.type === "tool_call_response" || part.type === "tool-result") {
        flushText()
        const response = "response" in part ? part.response : part.result
        const status = responseIndicatesFailure(response) ? "error" : "ok"
        if (message.role === "tool" || message.role === "function") {
          lines.push(`[m${msgIdx} toolresult]: ${status}`)
        }
      }
    }

    flushText()
  }

  return lines.length > 0 ? lines.join("\n") : "<no conversation messages available>"
}

const loadTraceDetail = (input: RunFlaggerAnnotatorInput) =>
  Effect.gen(function* () {
    const traceRepository = yield* TraceRepository

    return yield* traceRepository.findByTraceId({
      organizationId: OrganizationId(input.organizationId),
      projectId: ProjectId(input.projectId),
      traceId: TraceId(input.traceId),
    })
  })

/**
 * Draft annotation feedback from an already-loaded trace.
 *
 * Pure annotator — no repository dependency, no data loading. Callers that
 * already hold a `TraceDetail` (eval harnesses, experiment runners) use this
 * directly; production paths use {@link runFlaggerAnnotatorUseCase}, which
 * fetches the trace and delegates here.
 */
export const annotateTraceForFlaggerUseCase = Effect.fn("flaggers.annotateTraceForFlagger")(function* (
  input: AnnotateTraceForFlaggerInput,
) {
  const ai = yield* AI

  const systemPrompt = buildAnnotatorSystemPrompt(input.flaggerSlug)

  const conversationText =
    input.trace.allMessages.length > 0
      ? formatConversationForAnnotator(input.trace.allMessages)
      : "<no conversation messages available>"

  const durationSeconds = input.trace.durationNs / 1_000_000_000

  const prompt = `Provided inputs only — use these facts and the conversation below; do not invent details.

Trace summary (telemetry aggregates; cite only when relevant):
- Approximate duration: ${durationSeconds.toFixed(durationSeconds < 10 ? 2 : 1)}s
- Span count: ${input.trace.spanCount}
- Error count: ${input.trace.errorCount}
- Trace messages (raw): ${input.trace.allMessages.length}

Conversation transcript for annotation:
- This is a compact, normalized rendering of the trace.
- [toolcall] lines name the tool that was invoked.
- [toolresult] lines summarize only whether the tool succeeded or failed.
- Write about the underlying issue in plain language, not about the transcript formatting or what was omitted.
${conversationText}

Return structured data with a single "feedback" field per the system instructions.`

  const result = yield* ai.generate({
    ...FLAGGER_ANNOTATOR_MODEL,
    maxTokens: FLAGGER_ANNOTATOR_MAX_TOKENS,
    system: systemPrompt,
    prompt,
    schema: flaggerAnnotatorOutputSchema,
    telemetry: {
      spanName: AI_GENERATE_TELEMETRY_SPAN_NAMES.flaggerDraft,
      tags: [...AI_GENERATE_TELEMETRY_TAGS.flaggerDraft],
      metadata: buildProjectScopedAiMetadata(
        { organizationId: input.organizationId, projectId: input.projectId },
        { traceId: input.traceId, flaggerSlug: input.flaggerSlug, scoreId: input.scoreId },
      ),
    },
  })

  return {
    feedback: result.object.feedback,
    traceCreatedAt: input.trace.startTime.toISOString(),
    sessionId: input.trace.sessionId,
    simulationId: input.trace.simulationId === "" ? null : input.trace.simulationId,
    messageIndex: result.object.messageIndex,
  }
})

/**
 * Load the trace via the repository, then draft its annotation.
 *
 * Production entry point — used by the Temporal activity in
 * `flaggerWorkflow` after a match.
 */
export const runFlaggerAnnotatorUseCase = Effect.fn("flaggers.runFlaggerAnnotator")(function* (
  input: RunFlaggerAnnotatorInput,
) {
  yield* Effect.annotateCurrentSpan("flagger.organizationId", input.organizationId)
  yield* Effect.annotateCurrentSpan("flagger.projectId", input.projectId)
  yield* Effect.annotateCurrentSpan("flagger.traceId", input.traceId)
  yield* Effect.annotateCurrentSpan("flagger.flaggerSlug", input.flaggerSlug)

  const trace = yield* loadTraceDetail(input)
  return yield* annotateTraceForFlaggerUseCase({ ...input, trace })
})
