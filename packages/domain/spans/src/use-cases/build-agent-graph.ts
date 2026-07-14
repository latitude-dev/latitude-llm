import { AGENT_GRAPH_MAIN_ID, MAX_AGENT_GRAPH_DEPTH } from "../constants.ts"
import { isLlmCompletionOperation } from "../helpers/resolve-last-llm-completion-span.ts"

/**
 * Structural span shape `buildAgentGraph` consumes. Deliberately loose so it is
 * satisfied by both the domain `Span` (Date times, branded ids) and the web
 * `SpanRecord` (ISO-string times, plain strings) without adaptation.
 */
export interface AgentGraphSpanInput {
  readonly traceId: string
  readonly spanId: string
  readonly parentSpanId: string
  readonly operation: string
  readonly name: string
  readonly toolName: string
  readonly model: string
  readonly agentName?: string
  readonly statusCode: string
  readonly startTime: string | Date
  readonly endTime: string | Date
  readonly costTotalMicrocents: number
  readonly tokensInput: number
  readonly tokensOutput: number
  readonly tokensCacheRead?: number
  readonly tokensCacheCreate?: number
  readonly tokensReasoning?: number
  readonly toolCallId?: string
}

export interface AgentMetrics {
  readonly costMicrocents: number
  readonly tokensInput: number
  readonly tokensOutput: number
  readonly tokensCacheRead: number
  readonly tokensCacheCreate: number
  readonly tokensReasoning: number
  /** Wall-clock of the node's boundary span (trace bounds for the main). Non-additive across nodes. */
  readonly durationMs: number
}

export type AgentNodeKind = "main" | "subagent"

export type AgentTrigger =
  | { readonly type: "root" }
  | { readonly type: "tool"; readonly toolName: string; readonly toolCallId: string | undefined }
  | { readonly type: "invoke_agent" }

export interface AgentNode {
  readonly id: string
  readonly ref: { readonly traceId: string; readonly spanId: string | null }
  readonly kind: AgentNodeKind
  /** True when the main agent has no single backing `invoke_agent` span (0/multiple roots, or none). */
  readonly isVirtual: boolean
  readonly parentId: string | null
  readonly children: AgentNode[]
  readonly depth: number
  readonly label: string
  readonly trigger: AgentTrigger
  readonly representativeGenerationSpanId: string | undefined
  readonly models: readonly string[]
  readonly ownGenerationCount: number
  readonly own: AgentMetrics
  /** own + Σ descendants (cost/tokens); `durationMs` equals `own.durationMs` by design. */
  readonly total: AgentMetrics
  readonly hasError: boolean
  readonly startTime: number
  readonly endTime: number
}

export interface AgentGraph {
  /** One main node per trace, chronological by start time. */
  readonly roots: readonly AgentNode[]
  readonly nodesById: ReadonlyMap<string, AgentNode>
  /** `agentGraphSpanKey(traceId, spanId)` → the node that owns that span. Keyed by trace since span ids are trace-scoped. */
  readonly nodeForSpanId: ReadonlyMap<string, AgentNode>
  /** `agentGraphToolCallKey(traceId, toolCallId)` → the subagent node that tool call launched (when detectable). */
  readonly nodeByToolCallId: ReadonlyMap<string, AgentNode>
}

/** Key for `AgentGraph.nodeForSpanId`. Span ids are only unique within a trace, so a session-wide graph must scope by trace. */
export function agentGraphSpanKey(traceId: string, spanId: string): string {
  return `${traceId}:${spanId}`
}

/** Key for `AgentGraph.nodeByToolCallId`. Tool-call ids are only unique within a trace. */
export function agentGraphToolCallKey(traceId: string, toolCallId: string): string {
  return `${traceId}:${toolCallId}`
}

interface AgentGraphInput {
  readonly spans: readonly AgentGraphSpanInput[]
}

function toMs(value: string | Date): number {
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isFinite(ms) ? ms : 0
}

function isCandidateOperation(operation: string): boolean {
  return operation === "execute_tool" || operation === "invoke_agent"
}

function emptyMetrics(): MutableMetrics {
  return {
    costMicrocents: 0,
    tokensInput: 0,
    tokensOutput: 0,
    tokensCacheRead: 0,
    tokensCacheCreate: 0,
    tokensReasoning: 0,
    durationMs: 0,
  }
}

interface MutableMetrics {
  costMicrocents: number
  tokensInput: number
  tokensOutput: number
  tokensCacheRead: number
  tokensCacheCreate: number
  tokensReasoning: number
  durationMs: number
}

function addSpanMetrics(target: MutableMetrics, span: AgentGraphSpanInput): void {
  target.costMicrocents += span.costTotalMicrocents
  target.tokensInput += span.tokensInput
  target.tokensOutput += span.tokensOutput
  target.tokensCacheRead += span.tokensCacheRead ?? 0
  target.tokensCacheCreate += span.tokensCacheCreate ?? 0
  target.tokensReasoning += span.tokensReasoning ?? 0
}

/** Earliest-by-start ordering (span id tiebreak) used to pick a node's identity invoke_agent span. */
function isEarlierByStart(a: AgentGraphSpanInput, b: AgentGraphSpanInput): boolean {
  const byStart = toMs(a.startTime) - toMs(b.startTime)
  if (byStart !== 0) return byStart < 0
  return a.spanId.localeCompare(b.spanId) < 0
}

/** Latest-first ordering used to pick a node's representative generation span. */
function isMoreRecentGeneration(a: AgentGraphSpanInput, b: AgentGraphSpanInput): boolean {
  const byEnd = toMs(a.endTime) - toMs(b.endTime)
  if (byEnd !== 0) return byEnd > 0
  const byStart = toMs(a.startTime) - toMs(b.startTime)
  if (byStart !== 0) return byStart > 0
  return a.spanId.localeCompare(b.spanId) < 0
}

type Classification = "main_scope" | "subagent_candidate" | "transparent" | "tool_candidate"

/**
 * Builds the per-trace agent forest of a set of spans: main agent + subagents,
 * recursively, with exclusive ("own") and inclusive ("total") cost/token/
 * duration breakdowns.
 *
 * Pure and framework-free so it runs in the Vite client bundle. Trace-local
 * (parent links are trace-scoped) — spans from multiple traces produce one main
 * per trace under a shared, flat `roots` list.
 */
export function buildAgentGraph({ spans }: AgentGraphInput): AgentGraph {
  const spansByTrace = new Map<string, AgentGraphSpanInput[]>()
  for (const span of spans) {
    const bucket = spansByTrace.get(span.traceId)
    if (bucket) bucket.push(span)
    else spansByTrace.set(span.traceId, [span])
  }

  const roots: AgentNode[] = []
  const nodesById = new Map<string, AgentNode>()
  const nodeForSpanId = new Map<string, AgentNode>()
  const nodeByToolCallId = new Map<string, AgentNode>()

  for (const [traceId, traceSpans] of spansByTrace) {
    buildTraceGraph(traceId, traceSpans, { roots, nodesById, nodeForSpanId, nodeByToolCallId })
  }

  roots.sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id))

  return { roots, nodesById, nodeForSpanId, nodeByToolCallId }
}

interface GraphAccumulator {
  readonly roots: AgentNode[]
  readonly nodesById: Map<string, AgentNode>
  readonly nodeForSpanId: Map<string, AgentNode>
  readonly nodeByToolCallId: Map<string, AgentNode>
}

function buildTraceGraph(traceId: string, traceSpans: readonly AgentGraphSpanInput[], acc: GraphAccumulator): void {
  const spanById = new Map<string, AgentGraphSpanInput>()
  for (const span of traceSpans) spanById.set(span.spanId, span)

  // ── nca(s): nearest candidate (execute_tool|invoke_agent) strict ancestor ──
  const ncaMemo = new Map<string, AgentGraphSpanInput | undefined>()
  function nca(span: AgentGraphSpanInput): AgentGraphSpanInput | undefined {
    if (ncaMemo.has(span.spanId)) return ncaMemo.get(span.spanId)
    ncaMemo.set(span.spanId, undefined) // cycle guard: self-reference resolves to no-ancestor
    const seen = new Set<string>([span.spanId])
    let current = spanById.get(span.parentSpanId)
    let depth = 0
    let result: AgentGraphSpanInput | undefined
    while (current && depth < MAX_AGENT_GRAPH_DEPTH) {
      if (seen.has(current.spanId)) break
      seen.add(current.spanId)
      if (isCandidateOperation(current.operation)) {
        result = current
        break
      }
      current = spanById.get(current.parentSpanId)
      depth++
    }
    ncaMemo.set(span.spanId, result)
    return result
  }

  const candidates = traceSpans.filter((s) => isCandidateOperation(s.operation))

  const classificationById = new Map<string, Classification>()
  for (const c of candidates) {
    const parent = nca(c)
    if (c.operation === "invoke_agent") {
      if (!parent) classificationById.set(c.spanId, "main_scope")
      else if (parent.operation === "invoke_agent") classificationById.set(c.spanId, "subagent_candidate")
      else classificationById.set(c.spanId, "transparent")
    } else {
      classificationById.set(c.spanId, "tool_candidate")
    }
  }

  // ── effectiveOwnerCandidate: bubble a generation up through transparent wrappers ──
  const effMemo = new Map<string, AgentGraphSpanInput | undefined>()
  function effectiveOwner(candidate: AgentGraphSpanInput): AgentGraphSpanInput | undefined {
    if (effMemo.has(candidate.spanId)) return effMemo.get(candidate.spanId)
    effMemo.set(candidate.spanId, candidate)
    if (classificationById.get(candidate.spanId) !== "transparent") return candidate
    const parent = nca(candidate)
    const owner = parent ? effectiveOwner(parent) : undefined
    effMemo.set(candidate.spanId, owner)
    return owner
  }

  // ── generation ownership → boundary set ──
  const generationCount = new Map<string, number>()
  for (const span of traceSpans) {
    if (!isLlmCompletionOperation(span.operation as never)) continue
    const parent = nca(span)
    const owner = parent ? effectiveOwner(parent) : undefined
    if (!owner) continue
    generationCount.set(owner.spanId, (generationCount.get(owner.spanId) ?? 0) + 1)
  }

  const mainScopeRoots = candidates.filter((c) => classificationById.get(c.spanId) === "main_scope")
  const backedMain = mainScopeRoots.length === 1 ? mainScopeRoots[0] : undefined

  function isBoundary(candidate: AgentGraphSpanInput): boolean {
    if (candidate.spanId === backedMain?.spanId) return true
    return (generationCount.get(candidate.spanId) ?? 0) > 0
  }

  // Node-backing candidates: the backed main plus every boundary that isn't it.
  const nodeCandidateIds = new Set<string>()
  for (const c of candidates) {
    if (isBoundary(c)) nodeCandidateIds.add(c.spanId)
  }

  // ── agent-identity invoke_agent span per node ──
  // The span whose `agentName` names the node's agent: the invoke_agent boundary
  // itself, or — for a tool boundary — the transparent invoke_agent collapsed into
  // it (earliest by start). Never the execute_tool boundary span: SDKs stamp the
  // *parent* agent's name on the tool call, so its own value is the wrong agent.
  const identitySpanByCandidateId = new Map<string, AgentGraphSpanInput>()
  if (backedMain) identitySpanByCandidateId.set(backedMain.spanId, backedMain)
  for (const c of candidates) {
    if (nodeCandidateIds.has(c.spanId) && c.operation === "invoke_agent") {
      identitySpanByCandidateId.set(c.spanId, c)
    }
  }
  for (const c of candidates) {
    if (classificationById.get(c.spanId) !== "transparent") continue
    const owner = effectiveOwner(c)
    if (!owner || owner.operation !== "execute_tool" || !nodeCandidateIds.has(owner.spanId)) continue
    const existing = identitySpanByCandidateId.get(owner.spanId)
    if (!existing || isEarlierByStart(c, existing)) identitySpanByCandidateId.set(owner.spanId, c)
  }

  const traceStart = traceSpans.reduce((min, s) => Math.min(min, toMs(s.startTime)), Number.POSITIVE_INFINITY)
  const traceEnd = traceSpans.reduce((max, s) => Math.max(max, toMs(s.endTime)), Number.NEGATIVE_INFINITY)

  const mainId = backedMain ? `${traceId}:${backedMain.spanId}` : `${AGENT_GRAPH_MAIN_ID}:${traceId}`

  interface NodeState {
    readonly node: MutableNode
    readonly own: MutableMetrics
    readonly ownedGenerations: AgentGraphSpanInput[]
  }
  interface MutableNode extends Omit<AgentNode, "children" | "own" | "total" | "parentId" | "depth"> {
    parentId: string | null
    depth: number
    children: MutableNode[]
    own: AgentMetrics
    total: AgentMetrics
  }

  const stateByCandidateId = new Map<string, NodeState>()

  // ── enclosingNode(candidate): nearest boundary above it, else the main ──
  function enclosingNodeId(candidate: AgentGraphSpanInput): string {
    let current = nca(candidate)
    let depth = 0
    while (current && depth < MAX_AGENT_GRAPH_DEPTH) {
      if (nodeCandidateIds.has(current.spanId)) return `${traceId}:${current.spanId}`
      current = nca(current)
      depth++
    }
    return mainId
  }

  // ── ownerNodeId(span): the node whose "own" metrics absorb this span ──
  const ownerMemo = new Map<string, string>()
  function ownerNodeId(span: AgentGraphSpanInput): string {
    if (ownerMemo.has(span.spanId)) return ownerMemo.get(span.spanId) as string
    let current: AgentGraphSpanInput | undefined = isCandidateOperation(span.operation) ? span : nca(span)
    let depth = 0
    while (current && depth < MAX_AGENT_GRAPH_DEPTH) {
      if (nodeCandidateIds.has(current.spanId)) {
        const id = `${traceId}:${current.spanId}`
        ownerMemo.set(span.spanId, id)
        return id
      }
      current = nca(current)
      depth++
    }
    ownerMemo.set(span.spanId, mainId)
    return mainId
  }

  // ── main node ──
  const mainOwn = emptyMetrics()
  const mainNode: MutableNode = {
    id: mainId,
    ref: { traceId, spanId: backedMain?.spanId ?? null },
    kind: "main",
    isVirtual: !backedMain,
    parentId: null,
    depth: 0,
    label: "Main agent",
    trigger: { type: "root" },
    representativeGenerationSpanId: undefined,
    models: [],
    ownGenerationCount: 0,
    own: mainOwn,
    total: mainOwn,
    hasError: backedMain?.statusCode === "error",
    startTime: Number.isFinite(traceStart) ? traceStart : 0,
    endTime: Number.isFinite(traceEnd) ? traceEnd : 0,
    children: [],
  }
  const mainState: NodeState = { node: mainNode, own: mainOwn, ownedGenerations: [] }

  // ── subagent nodes ──
  for (const c of candidates) {
    if (!nodeCandidateIds.has(c.spanId)) continue
    if (c.spanId === backedMain?.spanId) continue
    const classification = classificationById.get(c.spanId)
    const trigger: AgentTrigger =
      classification === "tool_candidate"
        ? { type: "tool", toolName: c.toolName, toolCallId: c.toolCallId }
        : { type: "invoke_agent" }
    const own = emptyMetrics()
    const node: MutableNode = {
      id: `${traceId}:${c.spanId}`,
      ref: { traceId, spanId: c.spanId },
      kind: "subagent",
      isVirtual: false,
      parentId: null, // filled after all nodes exist
      depth: 0,
      label: subagentLabelFor(c),
      trigger,
      representativeGenerationSpanId: undefined,
      models: [],
      ownGenerationCount: 0,
      own,
      total: own,
      hasError: c.statusCode === "error",
      startTime: toMs(c.startTime),
      endTime: toMs(c.endTime),
      children: [],
    }
    stateByCandidateId.set(c.spanId, { node, own, ownedGenerations: [] })
  }

  // Link subagents to their enclosing node.
  for (const [candidateId, state] of stateByCandidateId) {
    const candidate = spanById.get(candidateId)
    if (!candidate) continue
    const parentId = enclosingNodeId(candidate)
    state.node.parentId = parentId
    const parent = parentId === mainId ? mainNode : stateByCandidateId.get(parentId.slice(traceId.length + 1))?.node
    if (parent) parent.children.push(state.node)
  }

  function stateForNodeId(id: string): NodeState | undefined {
    if (id === mainId) return mainState
    return stateByCandidateId.get(id.slice(traceId.length + 1))
  }

  // ── attribute every span to its owner's "own" metrics + collect generations ──
  for (const span of traceSpans) {
    const state = stateForNodeId(ownerNodeId(span))
    if (!state) continue
    addSpanMetrics(state.own, span)
    if (isLlmCompletionOperation(span.operation as never)) {
      state.ownedGenerations.push(span)
      if (span.statusCode === "error") {
        ;(state.node as { hasError: boolean }).hasError = true
      }
    }
  }

  // ── finalize per-node derived fields ──
  for (const state of [mainState, ...stateByCandidateId.values()]) {
    const gens = state.ownedGenerations
    ;(state.node as { ownGenerationCount: number }).ownGenerationCount = gens.length
    const models: string[] = []
    let representative: AgentGraphSpanInput | undefined
    for (const gen of gens) {
      if (gen.model && !models.includes(gen.model)) models.push(gen.model)
      if (!representative || isMoreRecentGeneration(gen, representative)) representative = gen
    }
    ;(state.node as { models: readonly string[] }).models = models
    ;(state.node as { representativeGenerationSpanId: string | undefined }).representativeGenerationSpanId =
      representative?.spanId
    const refSpanId = state.node.ref.spanId
    const identity = refSpanId ? identitySpanByCandidateId.get(refSpanId) : undefined
    const resolvedAgentName =
      identity?.agentName?.trim() || gens.map((gen) => gen.agentName?.trim()).find((name) => name)
    if (resolvedAgentName)
      (state.node as { label: string }).label = resolvedAgentName
      // Duration is the boundary wall-clock, already set; carry it into own.
    ;(state.own as MutableMetrics).durationMs = state.node.endTime - state.node.startTime
  }

  // ── post-order totals (cost/tokens sum; duration stays own) ──
  function computeTotal(node: MutableNode, depth: number): AgentMetrics {
    node.depth = depth
    const total = emptyMetrics()
    const own = stateForNodeId(node.id)?.own ?? emptyMetrics()
    total.costMicrocents = own.costMicrocents
    total.tokensInput = own.tokensInput
    total.tokensOutput = own.tokensOutput
    total.tokensCacheRead = own.tokensCacheRead
    total.tokensCacheCreate = own.tokensCacheCreate
    total.tokensReasoning = own.tokensReasoning
    total.durationMs = own.durationMs
    node.children.sort((a, b) => a.startTime - b.startTime || a.id.localeCompare(b.id))
    for (const child of node.children) {
      const childTotal = computeTotal(child, depth + 1)
      total.costMicrocents += childTotal.costMicrocents
      total.tokensInput += childTotal.tokensInput
      total.tokensOutput += childTotal.tokensOutput
      total.tokensCacheRead += childTotal.tokensCacheRead
      total.tokensCacheCreate += childTotal.tokensCacheCreate
      total.tokensReasoning += childTotal.tokensReasoning
    }
    node.total = total
    return total
  }
  computeTotal(mainNode, 0)

  // ── register into the shared accumulator ──
  const finalNode = mainNode as unknown as AgentNode
  acc.roots.push(finalNode)
  registerNode(finalNode, acc.nodesById)
  for (const span of traceSpans) {
    const state = stateForNodeId(ownerNodeId(span))
    if (state) acc.nodeForSpanId.set(agentGraphSpanKey(traceId, span.spanId), state.node as unknown as AgentNode)
  }
  for (const state of stateByCandidateId.values()) {
    const trigger = state.node.trigger
    if (trigger.type === "tool" && trigger.toolCallId) {
      acc.nodeByToolCallId.set(agentGraphToolCallKey(traceId, trigger.toolCallId), state.node as unknown as AgentNode)
    }
  }
}

function registerNode(node: AgentNode, nodesById: Map<string, AgentNode>): void {
  nodesById.set(node.id, node)
  for (const child of node.children) registerNode(child, nodesById)
}

// Structural fallback only; the resolved agentName (finalize step) overrides it
// when present. The boundary span's own `name` is a framework token (e.g.
// "interaction"), so a tool-triggered subagent prefers its tool name.
function subagentLabelFor(span: AgentGraphSpanInput): string {
  if (span.operation === "execute_tool") return span.toolName || span.name || "Subagent"
  return span.name || "Subagent"
}
