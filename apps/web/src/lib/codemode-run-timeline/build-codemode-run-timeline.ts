// Pure, dependency-free construction of the session-drawer "Run" tree for
// codemode orchestrations. Input shapes are structural subsets of the app's
// `SpanRecord` / `TraceRecord` / `SessionDetailRecord` / `GenAIMessage` so the
// UI can pass those records directly, while tests can supply richer fixtures
// (including the `latitude.codemode.*` span attributes that the session-level
// span collection does not yet serialize — see the module doc note below).
//
// Phase detection follows spec D6 priority: (1) `latitude.codemode.phase`
// attribute, (2) `ai.telemetry.functionId` attribute, (3) operation + name
// heuristics for legacy data. When no signal reaches high confidence a node is
// emitted as "unlabeled" so legacy sessions still render top-to-bottom.

export const CODEMODE_ATTR = {
  phase: "latitude.codemode.phase",
  innerTool: "latitude.codemode.inner_tool",
  turnId: "latitude.codemode.turn_id",
  parentToolCallId: "latitude.agent_tool.parent_tool_call_id",
  runId: "latitude.agent_tool.run_id",
  functionId: "ai.telemetry.functionId",
} as const

const FUNCTION_ID_PHASE: Readonly<Record<string, CodemodeRunNodeKind>> = {
  "codemode-plan": "plan",
  "codemode-summary": "summarize",
  "research-subagent-turn": "subagent",
}

const USER_LABEL_MAX_CHARS = 80

export type CodemodeRunNodeKind = "plan" | "execute" | "innerTool" | "subagent" | "summarize" | "agent" | "unlabeled"

export type CodemodeRunConfidence = "high" | "low"

export interface CodemodeTimelineSpanInput {
  readonly spanId: string
  readonly parentSpanId: string
  readonly traceId: string
  readonly name: string
  readonly operation: string
  readonly toolName: string
  readonly startTime: string
  readonly endTime: string
  readonly statusCode: string
  readonly statusMessage?: string
  readonly attrString?: Readonly<Record<string, string>>
  readonly attrBool?: Readonly<Record<string, boolean>>
}

export interface CodemodeTimelineTraceInput {
  readonly traceId: string
  readonly startTime: string
  readonly endTime: string
  readonly rootSpanName: string
  readonly errorCount: number
  readonly metadata?: Readonly<Record<string, string>>
}

export interface CodemodeTimelineMessageInput {
  readonly role: string
  readonly parts?: readonly unknown[]
  /** Optional wall-clock time; absent for `GenAIMessage`, present in fixtures that exercise the window fallback. */
  readonly atMs?: number
}

export interface CodemodeTimelineSessionInput {
  readonly sessionId: string
  readonly startTime: string
  readonly endTime: string
  readonly traceIds: readonly string[]
}

export interface CodemodeRunNode {
  /** Stable identity: the span id when the node is a span, otherwise the trace id. */
  readonly id: string
  readonly kind: CodemodeRunNodeKind
  readonly label: string
  readonly startMs: number
  readonly endMs: number
  readonly durationMs: number
  readonly isError: boolean
  readonly confidence: CodemodeRunConfidence
  readonly traceId: string
  /** Set when the node maps to a specific span (span-detail navigation); null for whole-trace rows. */
  readonly spanId: string | null
  readonly children: readonly CodemodeRunNode[]
  /** Short signal explaining why this step got its kind (shown muted in the Run tab). */
  readonly hint: string | null
}

export interface CodemodeRunTurn {
  readonly turnId: string
  readonly turnIndex: number
  readonly label: string
  readonly startMs: number
  readonly endMs: number
  readonly nodes: readonly CodemodeRunNode[]
}

export interface CodemodeRunTimeline {
  readonly turns: readonly CodemodeRunTurn[]
}

export interface BuildCodemodeRunTimelineInput {
  readonly session: CodemodeTimelineSessionInput
  readonly traces: readonly CodemodeTimelineTraceInput[]
  readonly spans: readonly CodemodeTimelineSpanInput[]
  readonly messages: readonly CodemodeTimelineMessageInput[]
}

interface NormalizedSpan {
  readonly spanId: string
  readonly parentSpanId: string
  readonly traceId: string
  readonly name: string
  readonly operation: string
  readonly toolName: string
  readonly startMs: number
  readonly endMs: number
  readonly isError: boolean
  readonly phaseAttr: string | undefined
  readonly functionId: string | undefined
  readonly turnId: string | undefined
  readonly isInnerTool: boolean
  readonly isSubagent: boolean
}

interface NormalizedTrace {
  readonly traceId: string
  readonly startMs: number
  readonly endMs: number
  readonly rootSpanName: string
  readonly isError: boolean
  readonly metadata: Readonly<Record<string, string>>
  readonly spans: readonly NormalizedSpan[]
  readonly turnId: string | undefined
}

const toMs = (iso: string): number => {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : 0
}

const attrBool = (span: CodemodeTimelineSpanInput, key: string): boolean =>
  span.attrBool?.[key] === true || span.attrString?.[key] === "true"

function normalizeSpan(span: CodemodeTimelineSpanInput): NormalizedSpan {
  const phaseAttr = span.attrString?.[CODEMODE_ATTR.phase]
  const functionId = span.attrString?.[CODEMODE_ATTR.functionId]
  const turnId = span.attrString?.[CODEMODE_ATTR.turnId]
  const isInnerTool = attrBool(span, CODEMODE_ATTR.innerTool)
  const isSubagent =
    functionId === "research-subagent-turn" ||
    phaseAttr === "subagent" ||
    span.attrString?.[CODEMODE_ATTR.runId] !== undefined ||
    span.attrString?.[CODEMODE_ATTR.parentToolCallId] !== undefined
  return {
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    traceId: span.traceId,
    name: span.name,
    operation: span.operation,
    toolName: span.toolName,
    startMs: toMs(span.startTime),
    endMs: toMs(span.endTime),
    isError: span.statusCode === "error",
    phaseAttr,
    functionId,
    turnId,
    isInnerTool,
    isSubagent,
  }
}

const isCodemodeExecuteSpan = (span: NormalizedSpan): boolean =>
  span.operation === "execute_tool" && (span.toolName === "codemode" || / codemode$/i.test(span.name))

const isToolCallSpan = (span: NormalizedSpan): boolean => span.operation === "execute_tool"

/** Phase from an individual span using D6 priorities 1→2→3. Returns undefined when nothing matches. */
function spanPhase(span: NormalizedSpan): { kind: CodemodeRunNodeKind; confidence: CodemodeRunConfidence } | undefined {
  if (isCodemodeExecuteSpan(span)) return { kind: "execute", confidence: "high" }
  if (span.phaseAttr === "plan" || span.phaseAttr === "execute" || span.phaseAttr === "summarize") {
    return { kind: span.phaseAttr, confidence: "high" }
  }
  if (span.functionId === "codemode-turn") {
    if (isCodemodeExecuteSpan(span)) return { kind: "execute", confidence: "high" }
    return undefined
  }
  if (span.functionId && FUNCTION_ID_PHASE[span.functionId]) {
    return { kind: FUNCTION_ID_PHASE[span.functionId] as CodemodeRunNodeKind, confidence: "high" }
  }
  if (span.isSubagent) return { kind: "subagent", confidence: "high" }
  if (span.isInnerTool && isToolCallSpan(span)) return { kind: "innerTool", confidence: "high" }
  if (/generateText/i.test(span.name)) return { kind: "plan", confidence: "low" }
  if (/streamText/i.test(span.name) && span.functionId === "codemode-summary") {
    return { kind: "summarize", confidence: "high" }
  }
  if (/streamText/i.test(span.name)) return { kind: "summarize", confidence: "low" }
  return undefined
}

function pickTurnId(spans: readonly NormalizedSpan[]): string | undefined {
  for (const span of spans) {
    if (span.turnId) return span.turnId
  }
  return undefined
}

function normalizeTrace(trace: CodemodeTimelineTraceInput, spans: readonly NormalizedSpan[]): NormalizedTrace {
  return {
    traceId: trace.traceId,
    startMs: toMs(trace.startTime),
    endMs: toMs(trace.endTime),
    rootSpanName: trace.rootSpanName,
    isError: trace.errorCount > 0 || spans.some((s) => s.isError),
    metadata: trace.metadata ?? {},
    spans,
    turnId: trace.metadata?.[CODEMODE_ATTR.turnId] ?? pickTurnId(spans),
  }
}

const SUBAGENT_METADATA_HINT = /subagent|sub-agent/i

function standaloneInnerToolSpan(trace: NormalizedTrace): NormalizedSpan | undefined {
  const toolSpans = trace.spans.filter((span) => isToolCallSpan(span) && !isCodemodeExecuteSpan(span))
  if (toolSpans.length !== 1) return undefined
  const only = toolSpans[0]
  if (!only?.isInnerTool) return undefined
  const nonToolSpans = trace.spans.filter((span) => !isToolCallSpan(span))
  if (
    nonToolSpans.some((span) => {
      const phase = spanPhase(span)
      return (
        phase?.kind === "subagent" || phase?.kind === "plan" || phase?.kind === "summarize" || phase?.kind === "execute"
      )
    })
  ) {
    return undefined
  }
  return only
}

function toolChildSpans(trace: NormalizedTrace, kind: CodemodeRunNodeKind): NormalizedSpan[] {
  if (kind === "execute") return innerToolSpans(trace)
  if (kind === "subagent") {
    return trace.spans.filter((span) => isToolCallSpan(span) && span.isInnerTool).sort((a, b) => a.startMs - b.startMs)
  }
  return []
}

function spanToChildNode(span: NormalizedSpan): CodemodeRunNode {
  return {
    id: span.spanId,
    kind: "innerTool",
    label: innerToolLabel(span),
    startMs: span.startMs,
    endMs: span.endMs,
    durationMs: Math.max(0, span.endMs - span.startMs),
    isError: span.isError,
    confidence: "high",
    traceId: span.traceId,
    spanId: span.spanId,
    children: [],
    hint: "inner sandbox tool",
  }
}
function tracePhase(trace: NormalizedTrace): { kind: CodemodeRunNodeKind; confidence: CodemodeRunConfidence } {
  let fallback: { kind: CodemodeRunNodeKind; confidence: CodemodeRunConfidence } | undefined
  for (const span of trace.spans) {
    const detected = spanPhase(span)
    if (!detected) continue
    if (detected.confidence === "high") return detected
    fallback = fallback ?? detected
  }

  const metaRole = trace.metadata.role ?? ""
  if (SUBAGENT_METADATA_HINT.test(metaRole)) return { kind: "subagent", confidence: "high" }

  if (
    trace.spans.length > 0 &&
    trace.spans.every((span) => span.functionId === "codemode-turn") &&
    trace.spans.every((span) => /streamText/i.test(span.name) || span.operation === "chat")
  ) {
    return { kind: "agent", confidence: "high" }
  }

  const rootName = trace.rootSpanName
  if (/ codemode$/i.test(rootName) || /toolCall codemode/i.test(rootName)) {
    return { kind: "execute", confidence: "low" }
  }
  if (/generateText/i.test(rootName)) return { kind: "plan", confidence: "low" }
  if (/streamText/i.test(rootName) && trace.spans.some((span) => span.functionId === "codemode-summary")) {
    return { kind: "summarize", confidence: "high" }
  }
  if (/streamText/i.test(rootName)) return { kind: "summarize", confidence: "low" }

  const loneInnerTool = standaloneInnerToolSpan(trace)
  if (loneInnerTool) return { kind: "innerTool", confidence: "high" }

  return fallback ?? { kind: "unlabeled", confidence: "low" }
}

/** Inner-tool spans of the execute trace: explicit `inner_tool` flag, else tool-call spans that aren't the codemode call itself. */
function innerToolSpans(trace: NormalizedTrace): NormalizedSpan[] {
  const explicit = trace.spans.filter((s) => s.isInnerTool)
  if (explicit.length > 0) return explicit.slice().sort((a, b) => a.startMs - b.startMs)
  return trace.spans.filter((s) => isToolCallSpan(s) && !isCodemodeExecuteSpan(s)).sort((a, b) => a.startMs - b.startMs)
}

function innerToolLabel(span: NormalizedSpan): string {
  if (span.toolName) return span.toolName
  return span.name.replace(/^ai\.toolCall\s+/i, "") || span.name
}

function phaseLabel(kind: CodemodeRunNodeKind, trace: NormalizedTrace): string {
  switch (kind) {
    case "plan":
      return "Plan"
    case "execute":
      return "Codemode execution"
    case "summarize":
      return "Summarize"
    case "agent":
      return "Agent response"
    case "innerTool": {
      const toolSpan = standaloneInnerToolSpan(trace) ?? trace.spans.find((span) => span.isInnerTool)
      return toolSpan ? innerToolLabel(toolSpan) : trace.rootSpanName || "Tool"
    }
    case "subagent": {
      const role = trace.metadata.role
      return role ? `Sub-agent · ${role}` : "Sub-agent"
    }
    default:
      return trace.rootSpanName || "Unlabeled phase"
  }
}

function phaseHint(kind: CodemodeRunNodeKind, trace: NormalizedTrace): string | null {
  switch (kind) {
    case "plan":
      return trace.spans.some((span) => span.functionId === "codemode-plan")
        ? "generateText · codemode-plan"
        : "generateText"
    case "agent":
      return "streamText · codemode-turn (main agent, not sandbox)"
    case "execute":
      return "execute_tool · codemode"
    case "summarize":
      return trace.spans.some((span) => span.functionId === "codemode-summary")
        ? "streamText · codemode-summary"
        : "streamText"
    case "subagent":
      return trace.metadata.role ? `sub-agent · ${trace.metadata.role}` : "research-subagent-turn"
    case "innerTool":
      return "inner sandbox tool"
    default:
      return null
  }
}

function buildTraceNode(trace: NormalizedTrace): CodemodeRunNode {
  const loneInnerTool = standaloneInnerToolSpan(trace)
  if (loneInnerTool) {
    return {
      ...spanToChildNode(loneInnerTool),
      kind: "innerTool",
      label: innerToolLabel(loneInnerTool),
    }
  }

  const { kind, confidence } = tracePhase(trace)
  const children: CodemodeRunNode[] = toolChildSpans(trace, kind).map(spanToChildNode)

  const primarySpan =
    kind === "innerTool" ? (trace.spans.find((span) => span.isInnerTool && isToolCallSpan(span)) ?? null) : null

  return {
    id: primarySpan?.spanId ?? trace.traceId,
    kind,
    label: phaseLabel(kind, trace),
    startMs: trace.startMs,
    endMs: trace.endMs,
    durationMs: Math.max(0, trace.endMs - trace.startMs),
    isError: trace.isError,
    confidence,
    traceId: trace.traceId,
    spanId: primarySpan?.spanId ?? null,
    children,
    hint: phaseHint(kind, trace),
  }
}

function messageText(message: CodemodeTimelineMessageInput): string {
  let text = ""
  for (const part of message.parts ?? []) {
    if (part && typeof part === "object" && (part as { type?: string }).type === "text") {
      const content = (part as { content?: unknown }).content
      if (typeof content === "string") text += `${content} `
    }
  }
  return text.replace(/\s+/g, " ").trim()
}

function turnLabel(userMessages: readonly CodemodeTimelineMessageInput[], turnIndex: number): string {
  const message = userMessages[turnIndex]
  const text = message ? messageText(message) : ""
  if (!text) return `Turn ${turnIndex + 1}`
  return text.length > USER_LABEL_MAX_CHARS ? `${text.slice(0, USER_LABEL_MAX_CHARS)}…` : text
}

function assignByTurnId(traces: readonly NormalizedTrace[]): Map<string, NormalizedTrace[]> {
  const byTurn = new Map<string, NormalizedTrace[]>()
  // Order turn ids by the earliest trace that carries them so turn indices read chronologically.
  const turnOrder = new Map<string, number>()
  const sorted = traces.slice().sort((a, b) => a.startMs - b.startMs)
  for (const trace of sorted) {
    const turnId = trace.turnId ?? "unassigned"
    if (!turnOrder.has(turnId)) turnOrder.set(turnId, turnOrder.size)
    const bucket = byTurn.get(turnId)
    if (bucket) bucket.push(trace)
    else byTurn.set(turnId, [trace])
  }
  return byTurn
}

/** Fallback turn count/boundaries when no `turn_id`: split the chronological run at each Plan phase. */
function assignByPlanBoundary(traces: readonly NormalizedTrace[]): NormalizedTrace[][] {
  const sorted = traces.slice().sort((a, b) => a.startMs - b.startMs)
  const groups: NormalizedTrace[][] = []
  for (const trace of sorted) {
    const kind = tracePhase(trace).kind
    if (groups.length === 0 || kind === "plan") {
      groups.push([trace])
    } else {
      const last = groups[groups.length - 1]
      if (last) last.push(trace)
    }
  }
  return groups.length > 0 ? groups : [[]]
}

/** Window fallback (spec §"Turn grouping"): assign traces to turns by user-message timestamps. */
function assignByMessageWindow(
  traces: readonly NormalizedTrace[],
  userMessages: readonly CodemodeTimelineMessageInput[],
  sessionEndMs: number,
): NormalizedTrace[][] {
  const windows = userMessages.map((message, index) => ({
    startMs: message.atMs ?? Number.NEGATIVE_INFINITY,
    endMs: userMessages[index + 1]?.atMs ?? sessionEndMs,
  }))
  const groups: NormalizedTrace[][] = windows.map(() => [])
  const sorted = traces.slice().sort((a, b) => a.startMs - b.startMs)
  for (const trace of sorted) {
    let turnIndex = 0
    for (let i = 0; i < windows.length; i++) {
      const window = windows[i]
      if (window && trace.startMs >= window.startMs && trace.startMs < window.endMs) {
        turnIndex = i
        break
      }
      if (window && trace.startMs >= window.endMs) turnIndex = Math.min(i + 1, windows.length - 1)
    }
    groups[turnIndex]?.push(trace)
  }
  return groups
}

function buildTurn(
  turnId: string,
  turnIndex: number,
  traces: readonly NormalizedTrace[],
  userMessages: readonly CodemodeTimelineMessageInput[],
): CodemodeRunTurn {
  const nodes = traces
    .slice()
    .sort((a, b) => a.startMs - b.startMs)
    .map(buildTraceNode)
  const startMs = nodes.reduce((min, node) => Math.min(min, node.startMs), Number.POSITIVE_INFINITY)
  const endMs = nodes.reduce((max, node) => Math.max(max, node.endMs), 0)
  return {
    turnId,
    turnIndex,
    label: turnLabel(userMessages, turnIndex),
    startMs: Number.isFinite(startMs) ? startMs : 0,
    endMs,
    nodes,
  }
}

export function buildCodemodeRunTimeline(input: BuildCodemodeRunTimelineInput): CodemodeRunTimeline {
  const normalizedSpans = input.spans.map(normalizeSpan)
  const spansByTrace = new Map<string, NormalizedSpan[]>()
  for (const span of normalizedSpans) {
    const bucket = spansByTrace.get(span.traceId)
    if (bucket) bucket.push(span)
    else spansByTrace.set(span.traceId, [span])
  }

  const traces = input.traces.map((trace) => normalizeTrace(trace, spansByTrace.get(trace.traceId) ?? []))
  const userMessages = input.messages.filter((message) => message.role === "user")
  const sessionEndMs = toMs(input.session.endTime)

  const distinctTurnIds = new Set(
    traces.map((trace) => trace.turnId).filter((turnId): turnId is string => turnId !== undefined),
  )
  const canGroupByTurnId = distinctTurnIds.size > 1 || (distinctTurnIds.size === 1 && userMessages.length <= 1)

  let turns: CodemodeRunTurn[]
  if (canGroupByTurnId && distinctTurnIds.size > 0) {
    const byTurn = assignByTurnId(traces)
    turns = [...byTurn.entries()].map(([turnId, group], index) => buildTurn(turnId, index, group, userMessages))
  } else {
    const hasTimestamps = userMessages.some((message) => message.atMs !== undefined)
    const groups =
      hasTimestamps && userMessages.length > 0
        ? assignByMessageWindow(traces, userMessages, sessionEndMs)
        : assignByPlanBoundary(traces)
    turns = groups.map((group, index) => buildTurn(`${input.session.sessionId}:${index}`, index, group, userMessages))
  }

  turns.sort((a, b) => a.startMs - b.startMs || a.turnIndex - b.turnIndex)
  return { turns: turns.map((turn, index) => ({ ...turn, turnIndex: index })) }
}
