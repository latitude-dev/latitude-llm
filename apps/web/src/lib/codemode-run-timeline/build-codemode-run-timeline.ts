// Pure, dependency-free construction of the session-drawer "Run" tree.
//
// First principles: a session's traces are disconnected islands — OTel context
// does NOT propagate across the sandbox / Durable-Object / isolate boundaries,
// so `parentSpanId` links never cross a trace. The agent→sub-agent dependency
// graph therefore is NOT in the waterfall; it has to be reconstructed from the
// natural keys that already exist on the spans (no bespoke per-span telemetry
// required beyond the sub-agent link):
//
//   • `ai.telemetry.functionId`        — native AI SDK; the node's role.
//   • `latitude.agent_tool.run_id`     — the ONE irreducible cross-boundary edge:
//                                        a delegate tool-call span and every span
//                                        of the sub-agent trace it spawned share it.
//   • `latitude.codemode.inner_tool`   — sandbox tool spans (attach under the code node).
//   • operation + tool name            — code node (`execute_tool` + `codemode`).
//
// The engine is generic: any agent→sub-agent workload renders with the same
// forest + run_id edge. Codemode is just the special case that inserts a
// "code execution" node between an agent and its (sandbox) tools.

const CODEMODE_ATTR = {
  innerTool: "latitude.codemode.inner_tool",
  parentToolCallId: "latitude.agent_tool.parent_tool_call_id",
  runId: "latitude.agent_tool.run_id",
  functionId: "ai.telemetry.functionId",
} as const

const FUNCTION_ID_KIND: Readonly<Record<string, CodemodeRunNodeKind>> = {
  "codemode-plan": "plan",
  "codemode-summary": "summarize",
  "codemode-turn": "agent",
  "research-subagent-turn": "subagent",
}

/** functionIds that start a new turn (a main-agent entry for one user message). */
const TURN_ENTRY_KINDS: ReadonlySet<CodemodeRunNodeKind> = new Set(["agent", "plan"])

const USER_LABEL_MAX_CHARS = 80
/** Slack allowed when matching an inner-tool trace into a code node's time window. */
const CONTAINMENT_TOLERANCE_MS = 50

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
}

interface CodemodeTimelineSessionInput {
  readonly sessionId: string
  readonly startTime: string
  readonly endTime: string
  readonly traceIds: readonly string[]
}

export interface CodemodeRunNode {
  /** Stable identity: the span id the node maps to. */
  readonly id: string
  readonly kind: CodemodeRunNodeKind
  readonly label: string
  readonly startMs: number
  readonly endMs: number
  readonly durationMs: number
  readonly isError: boolean
  readonly confidence: CodemodeRunConfidence
  readonly traceId: string
  /** The span this node navigates to (always set — nodes are span-backed). */
  readonly spanId: string
  readonly children: readonly CodemodeRunNode[]
  /** Short signal explaining why this step got its kind (shown muted in the Run tab). */
  readonly hint: string | null
}

interface CodemodeRunTurn {
  readonly turnId: string
  readonly turnIndex: number
  readonly label: string
  readonly startMs: number
  readonly endMs: number
  readonly nodes: readonly CodemodeRunNode[]
}

interface CodemodeRunTimeline {
  readonly turns: readonly CodemodeRunTurn[]
}

interface BuildCodemodeRunTimelineInput {
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
  readonly functionId: string | undefined
  readonly runId: string | undefined
  readonly parentToolCallId: string | undefined
  readonly isInnerTool: boolean
}

const toMs = (iso: string): number => {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : 0
}

const attrBool = (span: CodemodeTimelineSpanInput, key: string): boolean =>
  span.attrBool?.[key] === true || span.attrString?.[key] === "true"

function normalizeSpan(span: CodemodeTimelineSpanInput): NormalizedSpan {
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
    functionId: span.attrString?.[CODEMODE_ATTR.functionId],
    runId: span.attrString?.[CODEMODE_ATTR.runId],
    parentToolCallId: span.attrString?.[CODEMODE_ATTR.parentToolCallId],
    isInnerTool: attrBool(span, CODEMODE_ATTR.innerTool),
  }
}

const isToolSpan = (span: NormalizedSpan): boolean => span.operation === "execute_tool"

const isCodeExecuteSpan = (span: NormalizedSpan): boolean =>
  isToolSpan(span) && (span.toolName === "codemode" || / codemode$/i.test(span.name))

/** A bare AI-SDK `ai.toolCall` wrapper (no concrete tool) — structural noise we collapse through. */
const isToolWrapperSpan = (span: NormalizedSpan): boolean =>
  isToolSpan(span) && span.toolName === "" && /^ai\.toolCall$/i.test(span.name.trim())

const isAgentSpan = (span: NormalizedSpan): boolean => span.operation === "invoke_agent"

/** Kept nodes are the meaningful steps: agent turns, the code node, and concrete tool calls. */
function isMeaningful(span: NormalizedSpan): boolean {
  if (isAgentSpan(span)) return true
  if (isCodeExecuteSpan(span)) return true
  if (isToolSpan(span) && !isToolWrapperSpan(span)) return true
  return false
}

function toolLabel(span: NormalizedSpan): string {
  if (span.toolName) return span.toolName
  return span.name.replace(/^ai\.toolCall\s+/i, "").trim() || span.name
}

function spanKind(
  span: NormalizedSpan,
  viaSubagentEdge: boolean,
): { kind: CodemodeRunNodeKind; confidence: CodemodeRunConfidence } {
  if (isCodeExecuteSpan(span)) return { kind: "execute", confidence: "high" }
  if (isToolSpan(span)) return { kind: "innerTool", confidence: "high" }

  // invoke_agent from here down.
  if (span.functionId && FUNCTION_ID_KIND[span.functionId]) {
    return { kind: FUNCTION_ID_KIND[span.functionId] as CodemodeRunNodeKind, confidence: "high" }
  }
  if (viaSubagentEdge || span.runId !== undefined) return { kind: "subagent", confidence: "high" }
  if (/generateText/i.test(span.name)) return { kind: "plan", confidence: "low" }
  if (/streamText/i.test(span.name)) return { kind: "summarize", confidence: "low" }
  return { kind: "unlabeled", confidence: "low" }
}

function nodeLabel(
  kind: CodemodeRunNodeKind,
  span: NormalizedSpan,
  traceMeta: Readonly<Record<string, string>> | undefined,
): string {
  switch (kind) {
    case "plan":
      return "Plan"
    case "execute":
      return "Codemode execution"
    case "summarize":
      return "Summarize"
    case "agent":
      return "Agent response"
    case "innerTool":
      return toolLabel(span)
    case "subagent": {
      const role = traceMeta?.role
      return role ? `Sub-agent · ${role}` : "Sub-agent"
    }
    default:
      return span.name || "Unlabeled step"
  }
}

function nodeHint(kind: CodemodeRunNodeKind, span: NormalizedSpan): string | null {
  switch (kind) {
    case "plan":
      return span.functionId ? `${span.name} · ${span.functionId}` : span.name
    case "agent":
      return span.functionId ? `${span.name} · ${span.functionId}` : "main agent"
    case "execute":
      return "execute_tool · codemode"
    case "summarize":
      return span.functionId ? `${span.name} · ${span.functionId}` : span.name
    case "subagent":
      return span.functionId ?? "sub-agent"
    case "innerTool":
      return span.isInnerTool ? "inner sandbox tool" : "tool call"
    default:
      return null
  }
}

/**
 * Resolve the cross-trace parent of a trace-root span (a span whose `parentSpanId`
 * is not in the session). Returns the span id it should nest under, or undefined.
 */
function resolveCrossParent(
  root: NormalizedSpan,
  codeExecuteSpans: readonly NormalizedSpan[],
  delegateByRunId: ReadonlyMap<string, NormalizedSpan>,
): string | undefined {
  // Sub-agent trace → the delegate tool-call span that spawned it (shared run_id, different trace).
  if (isAgentSpan(root) && root.runId !== undefined) {
    const delegate = delegateByRunId.get(root.runId)
    if (delegate && delegate.traceId !== root.traceId) return delegate.spanId
  }
  // Inner sandbox tool trace → the code node whose execution window contains it.
  if (isToolSpan(root) && root.isInnerTool && !isCodeExecuteSpan(root)) {
    const container = codeExecuteSpans.find(
      (exec) =>
        exec.spanId !== root.spanId &&
        root.startMs >= exec.startMs - CONTAINMENT_TOLERANCE_MS &&
        root.startMs <= exec.endMs + CONTAINMENT_TOLERANCE_MS,
    )
    if (container) return container.spanId
    if (codeExecuteSpans.length === 1 && codeExecuteSpans[0]!.spanId !== root.spanId) {
      return codeExecuteSpans[0]!.spanId
    }
  }
  return undefined
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
  const text = userMessages[turnIndex] ? messageText(userMessages[turnIndex]!) : ""
  if (!text) return `Turn ${turnIndex + 1}`
  return text.length > USER_LABEL_MAX_CHARS ? `${text.slice(0, USER_LABEL_MAX_CHARS)}…` : text
}

export function buildCodemodeRunTimeline(input: BuildCodemodeRunTimelineInput): CodemodeRunTimeline {
  const spans = input.spans.map(normalizeSpan)
  const spansById = new Map(spans.map((span) => [span.spanId, span]))
  const traceMetaById = new Map(input.traces.map((trace) => [trace.traceId, trace.metadata ?? {}]))

  const codeExecuteSpans = spans.filter(isCodeExecuteSpan)
  // A delegate is the tool-call span that spawned a sub-agent (shares its run_id). A sub-agent's
  // OWN tool spans also inherit run_id, so prefer the tool span carrying parent_tool_call_id, then
  // a trace-root tool span, before any other tool span with that run_id.
  const delegateByRunId = new Map<string, NormalizedSpan>()
  const delegateRank = (span: NormalizedSpan): number => {
    if (span.parentToolCallId !== undefined) return 2
    if (span.parentSpanId === "" || !spansById.has(span.parentSpanId)) return 1
    return 0
  }
  for (const span of spans) {
    if (!isToolSpan(span) || span.runId === undefined) continue
    const current = delegateByRunId.get(span.runId)
    if (!current || delegateRank(span) > delegateRank(current)) delegateByRunId.set(span.runId, span)
  }

  // Adjacency across the whole session: intra-trace parentSpanId + cross-trace edges.
  const childrenByParent = new Map<string, NormalizedSpan[]>()
  const rootSpans: NormalizedSpan[] = []
  const subagentEdgeChildren = new Set<string>()
  const addChild = (parentId: string, child: NormalizedSpan) => {
    const bucket = childrenByParent.get(parentId)
    if (bucket) bucket.push(child)
    else childrenByParent.set(parentId, [child])
  }

  for (const span of spans) {
    const intraParent = span.parentSpanId ? spansById.get(span.parentSpanId) : undefined
    if (intraParent) {
      addChild(intraParent.spanId, span)
      continue
    }
    const crossParent = resolveCrossParent(span, codeExecuteSpans, delegateByRunId)
    if (crossParent) {
      addChild(crossParent, span)
      if (isAgentSpan(span) && span.runId !== undefined) subagentEdgeChildren.add(span.spanId)
      continue
    }
    rootSpans.push(span)
  }

  // Collapse structural noise (chat spans, bare tool wrappers), promoting kept descendants.
  const seen = new Set<string>()
  const collectKept = (span: NormalizedSpan): CodemodeRunNode[] => {
    if (seen.has(span.spanId)) return []
    seen.add(span.spanId)
    const rawChildren = (childrenByParent.get(span.spanId) ?? []).slice().sort((a, b) => a.startMs - b.startMs)
    const childNodes = rawChildren.flatMap(collectKept)
    if (!isMeaningful(span)) return childNodes
    const { kind, confidence } = spanKind(span, subagentEdgeChildren.has(span.spanId))
    return [
      {
        id: span.spanId,
        kind,
        label: nodeLabel(kind, span, traceMetaById.get(span.traceId)),
        startMs: span.startMs,
        endMs: span.endMs,
        durationMs: Math.max(0, span.endMs - span.startMs),
        isError: span.isError,
        confidence,
        traceId: span.traceId,
        spanId: span.spanId,
        children: childNodes,
        hint: nodeHint(kind, span),
      },
    ]
  }

  const forest = rootSpans
    .slice()
    .sort((a, b) => a.startMs - b.startMs)
    .flatMap(collectKept)

  // Turn grouping: a new turn begins at each main-agent entry (agent/plan). Sub-agent,
  // tool, code and summarize roots join the current turn. No turn_id / message-count coupling.
  const userMessages = input.messages.filter((message) => message.role === "user")
  const turnsNodes: CodemodeRunNode[][] = []
  for (const node of forest) {
    if (turnsNodes.length === 0 || TURN_ENTRY_KINDS.has(node.kind)) turnsNodes.push([node])
    else turnsNodes[turnsNodes.length - 1]!.push(node)
  }
  if (turnsNodes.length === 0) turnsNodes.push([])

  const turns: CodemodeRunTurn[] = turnsNodes.map((nodes, index) => {
    const startMs = nodes.reduce((min, node) => Math.min(min, node.startMs), Number.POSITIVE_INFINITY)
    const endMs = nodes.reduce((max, node) => Math.max(max, node.endMs), 0)
    return {
      turnId: `${input.session.sessionId}:${index}`,
      turnIndex: index,
      label: turnLabel(userMessages, index),
      startMs: Number.isFinite(startMs) ? startMs : 0,
      endMs,
      nodes,
    }
  })

  return { turns }
}
