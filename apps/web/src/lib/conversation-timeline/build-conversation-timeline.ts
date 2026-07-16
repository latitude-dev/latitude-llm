import type { GenAIMessage } from "rosetta-ai"
import { type ActivitySegment, buildActivityTrack } from "./build-activity-track.ts"
import { buildTimelineScale, type TimelineScale } from "./timeline-scale.ts"

export interface TimelineSpanInput {
  readonly spanId: string
  readonly parentSpanId: string
  readonly traceId: string
  readonly startMs: number
  readonly endMs: number
  readonly ttftMs: number
  readonly isStreaming: boolean
  readonly isError: boolean
  readonly name: string
  readonly operation: string
  readonly statusMessage: string
}

export interface TimelineTraceInput {
  readonly traceId: string
  readonly startMs: number
  readonly endMs: number
  readonly label: string
}

export interface TimelineAnnotationInput {
  readonly id: string
  readonly messageIndex: number | null
  readonly spanId: string | null
  readonly passed: boolean | null
  readonly feedback: string
  /** Set when a Latitude flagger created the annotation (e.g. "jailbreaking"). */
  readonly flaggerSlug: string | null
  readonly annotatorName: string | null
}

export interface TimelineMomentInput {
  readonly id: string
  readonly messageIndex: number
  readonly kind: string
  readonly summary: string
  readonly confidence: number | null
}

export interface TimelineSubagentInput {
  readonly traceId: string
  readonly spanId: string
  readonly label: string
  /** The spawning tool call, when the trigger is a tool call — anchors the marker to the tool call in the conversation. */
  readonly toolName: string | null
  readonly toolCallId: string | null
  readonly startMs: number
}

export type TimelineMessageSchedule =
  | { readonly kind: "instant"; readonly atMs: number }
  | {
      readonly kind: "streamed"
      readonly revealStartMs: number
      readonly revealEndMs: number
      readonly textChars: number
    }
  | {
      readonly kind: "toolResult"
      readonly parts: readonly {
        readonly partIndex: number
        readonly toolCallId: string | null
        readonly atMs: number
      }[]
    }

export type TimelineMarker =
  | {
      readonly kind: "trace"
      readonly atMs: number
      readonly traceIndex: number
      readonly traceId: string
      readonly label: string
      /** Excerpt of the user message that started the turn, when one is mapped. */
      readonly userExcerpt: string | null
      /** Index of the turn-starting user message; null when none is mapped. */
      readonly firstMessageIndex: number | null
    }
  | {
      readonly kind: "annotation"
      readonly atMs: number
      readonly annotationId: string
      readonly messageIndex: number | null
      readonly passed: boolean | null
      readonly feedback: string
      readonly flaggerSlug: string | null
      readonly annotatorName: string | null
    }
  | {
      readonly kind: "toolCall"
      readonly atMs: number
      readonly spanId: string
      readonly toolCallId: string | null
      readonly label: string
      readonly durationMs: number
      readonly errorExcerpt: string | null
    }
  | {
      readonly kind: "moment"
      readonly atMs: number
      readonly momentId: string
      readonly messageIndex: number
      readonly label: string
      readonly summary: string
      readonly confidence: number | null
    }
  | {
      readonly kind: "subagentSpawned"
      readonly atMs: number
      readonly traceId: string
      readonly spanId: string
      readonly label: string
      readonly toolName: string | null
      readonly toolCallId: string | null
    }

export interface ConversationTimeline {
  readonly messages: readonly GenAIMessage[]
  readonly schedules: readonly TimelineMessageSchedule[]
  readonly markers: readonly TimelineMarker[]
  /** Tool calls whose execute_tool span errored — overrides the message part's own success flag in the UI. */
  readonly failedToolCallIds: ReadonlySet<string>
  readonly activity: readonly ActivitySegment[]
  readonly scale: TimelineScale
  readonly wallStartMs: number
  readonly wallEndMs: number
}

export interface BuildConversationTimelineInput {
  readonly messages: readonly GenAIMessage[]
  readonly spans: readonly TimelineSpanInput[]
  readonly messageSpanMap: Readonly<Record<number, string>>
  readonly toolCallSpanMap: Readonly<Record<string, string>>
  readonly traces: readonly TimelineTraceInput[]
  readonly annotations: readonly TimelineAnnotationInput[]
  readonly moments: readonly TimelineMomentInput[]
  readonly subagents: readonly TimelineSubagentInput[]
}

/** Flatten a `{ traceId, spanId }`-valued span map to a bare span-id map (timelines are trace-local). */
export function toSpanIdMap<K extends string | number>(
  map: Readonly<Record<K, { readonly spanId: string }>>,
): Record<K, string> {
  const out = {} as Record<K, string>
  for (const key in map) out[key] = map[key].spanId
  return out
}

function countStreamableChars(message: GenAIMessage): number {
  let chars = 0
  for (const part of message.parts ?? []) {
    if (part.type === "text" || part.type === "reasoning") {
      chars += (part as { content: string }).content.length
    }
  }
  return chars
}

const EXCERPT_MAX_CHARS = 180

function excerptText(value: string): string | null {
  const collapsed = value.replace(/\s+/g, " ").trim()
  if (collapsed.length === 0) return null
  return collapsed.length > EXCERPT_MAX_CHARS ? `${collapsed.slice(0, EXCERPT_MAX_CHARS)}…` : collapsed
}

function messageTextExcerpt(message: GenAIMessage): string | null {
  let text = ""
  for (const part of message.parts ?? []) {
    if (part.type === "text") text += `${(part as { content: string }).content} `
  }
  return excerptText(text)
}

function toolResponseExcerpt(messages: readonly GenAIMessage[], toolCallId: string): string | null {
  for (const message of messages) {
    if (message.role !== "tool") continue
    for (const part of message.parts ?? []) {
      if (part.type !== "tool_call_response") continue
      const p = part as { id?: string | null; response?: unknown; result?: unknown }
      if (p.id !== toolCallId) continue
      const raw = p.response ?? p.result
      if (raw === undefined || raw === null) return null
      return excerptText(typeof raw === "string" ? raw : JSON.stringify(raw))
    }
  }
  return null
}

export function scheduleCompletionMs(schedule: TimelineMessageSchedule): number {
  switch (schedule.kind) {
    case "instant":
      return schedule.atMs
    case "streamed":
      return schedule.revealEndMs
    case "toolResult":
      return schedule.parts.reduce((max, part) => Math.max(max, part.atMs), 0)
  }
}

export function scheduleStartMs(schedule: TimelineMessageSchedule): number {
  switch (schedule.kind) {
    case "instant":
      return schedule.atMs
    case "streamed":
      return schedule.revealStartMs
    case "toolResult":
      return schedule.parts.length === 0
        ? scheduleCompletionMs(schedule)
        : schedule.parts.reduce((min, part) => Math.min(min, part.atMs), Number.POSITIVE_INFINITY)
  }
}

interface RevealWindow {
  readonly revealStartMs: number
  readonly revealEndMs: number
}

/**
 * Reveal window per mapped assistant message. A run of consecutive assistant
 * messages mapped to the same span splits that span's reveal window
 * proportionally by char count, in index order.
 */
function buildRevealWindows(
  messages: readonly GenAIMessage[],
  spanAt: (index: number) => TimelineSpanInput | null,
  clamp: (ms: number) => number,
): Map<number, RevealWindow> {
  const windows = new Map<number, RevealWindow>()
  let run: { span: TimelineSpanInput; indices: number[] } | null = null

  const flush = () => {
    if (!run) return
    const windowStart = clamp(Math.min(run.span.startMs + run.span.ttftMs, run.span.endMs))
    const windowEnd = Math.max(windowStart, clamp(run.span.endMs))
    const charCounts = run.indices.map((index) => {
      const message = messages[index]
      return message ? countStreamableChars(message) : 0
    })
    const totalChars = charCounts.reduce((sum, count) => sum + count, 0)
    let consumed = 0
    for (const [position, index] of run.indices.entries()) {
      if (totalChars === 0) {
        windows.set(index, { revealStartMs: windowEnd, revealEndMs: windowEnd })
        continue
      }
      const span = windowEnd - windowStart
      const revealStartMs = windowStart + (span * consumed) / totalChars
      consumed += charCounts[position] ?? 0
      const revealEndMs = windowStart + (span * consumed) / totalChars
      windows.set(index, { revealStartMs, revealEndMs })
    }
    run = null
  }

  for (let i = 0; i < messages.length; i++) {
    const span = messages[i]?.role === "assistant" ? spanAt(i) : null
    if (!span) {
      flush()
      continue
    }
    if (run && run.span === span && run.indices[run.indices.length - 1] === i - 1) {
      run.indices.push(i)
    } else {
      flush()
      run = { span, indices: [i] }
    }
  }
  flush()
  return windows
}

export function buildConversationTimeline(input: BuildConversationTimelineInput): ConversationTimeline {
  const traces = [...input.traces].sort((a, b) => a.startMs - b.startMs)
  const scale = buildTimelineScale(traces)
  const wallStartMs = scale.wallStartMs
  const wallEndMs = scale.wallEndMs
  const clamp = (ms: number) => Math.min(wallEndMs, Math.max(wallStartMs, ms))

  const spanById = new Map(input.spans.map((span) => [span.spanId, span]))
  const traceById = new Map(traces.map((trace) => [trace.traceId, trace]))

  const mappedSpanAt = (index: number): TimelineSpanInput | null => {
    const spanId = input.messageSpanMap[index]
    return spanId ? (spanById.get(spanId) ?? null) : null
  }
  const hasAnyMapping = input.messages.some((message, i) => message.role === "assistant" && mappedSpanAt(i) !== null)

  // nextMappedSpan[i]: the span generating the first mapped assistant message at or after i.
  const nextMappedSpan: (TimelineSpanInput | null)[] = new Array(input.messages.length).fill(null)
  for (let i = input.messages.length - 1; i >= 0; i--) {
    const message = input.messages[i]
    const own = message?.role === "assistant" ? mappedSpanAt(i) : null
    nextMappedSpan[i] = own ?? nextMappedSpan[i + 1] ?? null
  }

  const revealWindows = buildRevealWindows(input.messages, mappedSpanAt, clamp)

  const schedules: TimelineMessageSchedule[] = []
  const slideshowSlotMs = (index: number) =>
    wallStartMs + ((wallEndMs - wallStartMs) * (index + 1)) / (input.messages.length + 1)

  let prevEventMs = wallStartMs
  let currentTraceId: string | null = null
  const turnUserExcerpts = new Map<string, string>()
  const turnFirstMessageIndex = new Map<string, number>()

  for (let i = 0; i < input.messages.length; i++) {
    const message = input.messages[i]
    let schedule: TimelineMessageSchedule

    if (!message) {
      schedule = { kind: "instant", atMs: prevEventMs }
    } else if (!hasAnyMapping) {
      schedule = { kind: "instant", atMs: clamp(message.role === "system" ? wallStartMs : slideshowSlotMs(i)) }
    } else if (message.role === "system") {
      schedule = { kind: "instant", atMs: wallStartMs }
    } else if (message.role === "assistant") {
      const span = mappedSpanAt(i)
      const window = revealWindows.get(i)
      if (!span || !window) {
        schedule = { kind: "instant", atMs: clamp(prevEventMs + 1) }
      } else {
        currentTraceId = span.traceId
        const textChars = countStreamableChars(message)
        schedule =
          span.isStreaming && window.revealEndMs > window.revealStartMs && textChars > 0
            ? { kind: "streamed", revealStartMs: window.revealStartMs, revealEndMs: window.revealEndMs, textChars }
            : { kind: "instant", atMs: window.revealEndMs }
      }
    } else if (message.role === "tool") {
      const parts = (message.parts ?? []).map((part, partIndex) => {
        const toolCallId = part.type === "tool_call_response" ? ((part as { id?: string | null }).id ?? null) : null
        const executeSpanId = toolCallId ? input.toolCallSpanMap[toolCallId] : undefined
        const executeSpan = executeSpanId ? spanById.get(executeSpanId) : undefined
        const atMs = executeSpan ? clamp(executeSpan.endMs) : clamp(nextMappedSpan[i + 1]?.startMs ?? prevEventMs + 1)
        return { partIndex, toolCallId, atMs }
      })
      schedule = { kind: "toolResult", parts }
    } else {
      const nextSpan = nextMappedSpan[i]
      if (!nextSpan) {
        schedule = { kind: "instant", atMs: clamp(prevEventMs + 1) }
      } else {
        const trace = traceById.get(nextSpan.traceId)
        const isNewTurn = nextSpan.traceId !== currentTraceId
        if (message.role === "user" && isNewTurn) {
          if (!turnFirstMessageIndex.has(nextSpan.traceId)) turnFirstMessageIndex.set(nextSpan.traceId, i)
          if (!turnUserExcerpts.has(nextSpan.traceId)) {
            const excerpt = messageTextExcerpt(message)
            if (excerpt) turnUserExcerpts.set(nextSpan.traceId, excerpt)
          }
        }
        const atMs = isNewTurn && trace ? trace.startMs : nextSpan.startMs
        schedule = { kind: "instant", atMs: clamp(Math.max(atMs, prevEventMs)) }
      }
    }

    schedules.push(schedule)
    prevEventMs = Math.max(prevEventMs, scheduleCompletionMs(schedule))
  }

  for (const trace of traces) {
    if (turnFirstMessageIndex.has(trace.traceId)) continue
    const traceStartMs = clamp(trace.startMs)
    const traceEndMs = clamp(trace.endMs)
    const index = input.messages.findIndex((message, i) => {
      if (message.role !== "user") return false
      const schedule = schedules[i]
      if (!schedule) return false
      const atMs = scheduleStartMs(schedule)
      return atMs >= traceStartMs && atMs <= traceEndMs
    })
    if (index < 0) continue
    const message = input.messages[index]
    if (!message) continue
    turnFirstMessageIndex.set(trace.traceId, index)
    const excerpt = messageTextExcerpt(message)
    if (excerpt) turnUserExcerpts.set(trace.traceId, excerpt)
  }

  const markers: TimelineMarker[] = []
  for (const [index, trace] of traces.entries()) {
    markers.push({
      kind: "trace",
      atMs: clamp(trace.startMs),
      traceIndex: index,
      traceId: trace.traceId,
      label: trace.label,
      userExcerpt: turnUserExcerpts.get(trace.traceId) ?? null,
      firstMessageIndex: turnFirstMessageIndex.get(trace.traceId) ?? null,
    })
  }
  for (const annotation of input.annotations) {
    const anchoredSchedule = annotation.messageIndex !== null ? schedules[annotation.messageIndex] : undefined
    const anchoredSpan = annotation.spanId ? spanById.get(annotation.spanId) : undefined
    const atMs = anchoredSchedule
      ? scheduleCompletionMs(anchoredSchedule)
      : anchoredSpan
        ? anchoredSpan.endMs
        : wallEndMs
    markers.push({
      kind: "annotation",
      atMs: clamp(atMs),
      annotationId: annotation.id,
      messageIndex: annotation.messageIndex,
      passed: annotation.passed,
      feedback: annotation.feedback,
      flaggerSlug: annotation.flaggerSlug,
      annotatorName: annotation.annotatorName,
    })
  }
  const toolCallIdBySpanId = new Map(
    Object.entries(input.toolCallSpanMap).map(([toolCallId, spanId]) => [spanId, toolCallId]),
  )
  const failedToolCallIds = new Set<string>()
  for (const span of input.spans) {
    if (span.operation !== "execute_tool" || !span.isError) continue
    // The tool's returned output (what the conversation shows) beats the span status message.
    const toolCallId = toolCallIdBySpanId.get(span.spanId)
    if (toolCallId) failedToolCallIds.add(toolCallId)
    const errorExcerpt =
      (toolCallId ? toolResponseExcerpt(input.messages, toolCallId) : null) ?? excerptText(span.statusMessage)
    markers.push({
      kind: "toolCall",
      atMs: clamp(span.endMs),
      spanId: span.spanId,
      toolCallId: toolCallId ?? null,
      label: span.name,
      durationMs: span.endMs - span.startMs,
      errorExcerpt,
    })
  }
  for (const moment of input.moments) {
    const anchoredSchedule = schedules[moment.messageIndex]
    const atMs = anchoredSchedule ? scheduleCompletionMs(anchoredSchedule) : wallEndMs
    markers.push({
      kind: "moment",
      atMs: clamp(atMs),
      momentId: moment.id,
      messageIndex: moment.messageIndex,
      label: moment.kind,
      summary: moment.summary,
      confidence: moment.confidence,
    })
  }
  for (const subagent of input.subagents) {
    markers.push({
      kind: "subagentSpawned",
      atMs: clamp(subagent.startMs),
      traceId: subagent.traceId,
      spanId: subagent.spanId,
      label: subagent.label,
      toolName: subagent.toolName,
      toolCallId: subagent.toolCallId,
    })
  }
  markers.sort((a, b) => a.atMs - b.atMs)

  const activity = buildActivityTrack(input.spans, scale)

  return {
    messages: input.messages,
    schedules,
    markers,
    failedToolCallIds,
    activity,
    scale,
    wallStartMs,
    wallEndMs,
  }
}
