import type { SessionGenerationFact } from "@domain/spans"
import { stableStringify } from "@repo/utils"
import type { GenAIMessage, GenAIPart } from "rosetta-ai"

/**
 * Counts the tokens of a piece of content.
 *
 * Injected rather than imported so the ledger stays pure and a provider-aware tokenizer can
 * replace the shared `o200k_base` approximation without touching attribution. Every estimate a
 * ledger produces inherits the accuracy of whatever is passed here, which is why its readings
 * carry identification bounds rather than exact token counts.
 */
export type TokenCounter = (content: string) => number

export const CONTENT_ATOM_KINDS = [
  "toolCall",
  "toolResult",
  "priorGeneration",
  "priorReasoning",
  "systemFraming",
  "userInput",
] as const
export type ContentAtomKind = (typeof CONTENT_ATOM_KINDS)[number]

/**
 * The smallest piece of model input that can be claimed once.
 *
 * Identity is content, not position: the same tool result carried into six later prompts is one
 * atom seen six times, which is what makes repetition measurable at all. The digest is a
 * non-cryptographic in-session grouping key and is never persisted.
 */
export interface ContentAtom {
  readonly atomId: string
  readonly kind: ContentAtomKind
  readonly estimatedTokens: number
  readonly toolName?: string
  readonly toolCallId?: string
}

export interface GenerationInputLedger {
  readonly traceId: string
  readonly spanId: string
  readonly reportedInputTokens: number
  readonly atomIds: readonly string[]
  readonly attributedTokens: number
  /** Reported input the atoms do not account for: provider framing and hidden content. */
  readonly residualTokens: number
  /** Attribution beyond the reported total, which only an approximate tokenizer can produce. */
  readonly overshootTokens: number
  readonly modelContextLimitTokens: number | null
}

export interface SessionContentLedger {
  readonly generations: readonly GenerationInputLedger[]
  readonly atomsById: ReadonlyMap<string, ContentAtom>
  /** Atom id → the generation spans whose input carried it, chronologically. */
  readonly occurrencesByAtom: ReadonlyMap<string, readonly string[]>
  readonly readableInputTokens: number
  readonly readableGenerationCount: number
  readonly unreadableGenerationCount: number
}

/** FNV-1a over the canonical content. Identity only: never a security or persistence boundary. */
const contentDigest = (value: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, "0")
}

const partText = (part: GenAIPart): string | undefined => {
  const candidate = part as { readonly type?: string; readonly content?: unknown }
  return typeof candidate.content === "string" ? candidate.content : undefined
}

interface ClassifiedPart {
  readonly kind: ContentAtomKind
  readonly canonical: string
  readonly toolName?: string
  readonly toolCallId?: string
}

interface TypedPart {
  readonly type?: string
  readonly id?: string | null
  readonly name?: string
  readonly arguments?: unknown
  readonly response?: unknown
}

const TOOL_PART_TYPES = new Set(["tool_call", "tool_use", "tool_call_response", "tool_result"])
const REASONING_PART_TYPES = new Set(["reasoning", "thinking"])
const TEXT_KIND_BY_ROLE: Readonly<Record<string, ContentAtomKind>> = {
  assistant: "priorGeneration",
  system: "systemFraming",
}

const classifyToolPart = (typed: TypedPart, part: GenAIPart): ClassifiedPart => {
  if (typed.type === "tool_call" || typed.type === "tool_use") {
    const name = typed.name ?? ""
    return {
      kind: "toolCall",
      canonical: `${name} ${stableStringify(typed.arguments ?? null)}`,
      ...(name ? { toolName: name } : {}),
      ...(typed.id ? { toolCallId: typed.id } : {}),
    }
  }
  return {
    kind: "toolResult",
    canonical: stableStringify(typed.response ?? partText(part) ?? null),
    ...(typed.id ? { toolCallId: typed.id } : {}),
  }
}

const classifyPart = (role: string, part: GenAIPart): ClassifiedPart | null => {
  const typed = part as TypedPart
  const type = typed.type
  if (type !== undefined && TOOL_PART_TYPES.has(type)) return classifyToolPart(typed, part)
  const text = partText(part)
  if (text === undefined) return null
  if (type !== undefined && REASONING_PART_TYPES.has(type)) return { kind: "priorReasoning", canonical: text }
  if (type !== "text") return null
  return { kind: TEXT_KIND_BY_ROLE[role] ?? "userInput", canonical: text }
}

const reportedInputTokensOf = (generation: SessionGenerationFact): number =>
  generation.tokens.tokensInput + generation.tokens.tokensCacheRead + generation.tokens.tokensCacheCreate

interface LedgerAccumulator {
  readonly atomsById: Map<string, ContentAtom>
  readonly occurrencesByAtom: Map<string, string[]>
}

const upsertAtom = ({
  entry,
  countTokens,
  atomsById,
}: {
  readonly entry: ClassifiedPart
  readonly countTokens: TokenCounter
  readonly atomsById: Map<string, ContentAtom>
}): ContentAtom => {
  const atomId = `${entry.kind}:${contentDigest(entry.canonical)}`
  const existing = atomsById.get(atomId)
  if (existing) return existing
  const atom: ContentAtom = {
    atomId,
    kind: entry.kind,
    estimatedTokens: countTokens(entry.canonical),
    ...(entry.toolName ? { toolName: entry.toolName } : {}),
    ...(entry.toolCallId ? { toolCallId: entry.toolCallId } : {}),
  }
  atomsById.set(atomId, atom)
  return atom
}

const classifyMessages = (messages: readonly GenAIMessage[]): ClassifiedPart[] =>
  messages.flatMap((message) =>
    message.parts.flatMap((part) => {
      const entry = classifyPart(message.role, part)
      return entry && entry.canonical !== "" ? [entry] : []
    }),
  )

const collectAtoms = ({
  messages,
  countTokens,
  accumulator,
  spanId,
}: {
  readonly messages: readonly GenAIMessage[]
  readonly countTokens: TokenCounter
  readonly accumulator: LedgerAccumulator
  readonly spanId: string
}): { readonly atomIds: string[]; readonly attributedTokens: number } => {
  const seen = new Set<string>()
  const atomIds: string[] = []
  let attributedTokens = 0

  for (const entry of classifyMessages(messages)) {
    const atom = upsertAtom({ entry, countTokens, atomsById: accumulator.atomsById })
    if (seen.has(atom.atomId)) continue
    seen.add(atom.atomId)
    atomIds.push(atom.atomId)
    attributedTokens += atom.estimatedTokens
    accumulator.occurrencesByAtom.set(atom.atomId, [...(accumulator.occurrencesByAtom.get(atom.atomId) ?? []), spanId])
  }

  return { atomIds, attributedTokens }
}

/**
 * Every generation input in the session, decomposed into the content atoms that make it up.
 *
 * Attribution is reconciled against the reported input tokens rather than trusted: whatever the
 * atoms do not explain stays an explicit residual, so provider framing and hidden content are
 * visible as unattributed instead of being silently blamed on the agent. A generation whose content
 * was never captured or was skipped by a read budget is counted as unreadable, not as empty.
 */
export const buildSessionContentLedger = ({
  generations,
  countTokens,
}: {
  readonly generations: readonly SessionGenerationFact[]
  readonly countTokens: TokenCounter
}): SessionContentLedger => {
  const accumulator: LedgerAccumulator = { atomsById: new Map(), occurrencesByAtom: new Map() }
  const ordered = [...generations].sort(
    (left, right) => left.startTime.getTime() - right.startTime.getTime() || left.spanId.localeCompare(right.spanId),
  )

  const ledgers: GenerationInputLedger[] = []
  let unreadableGenerationCount = 0

  for (const generation of ordered) {
    const reportedInputTokens = reportedInputTokensOf(generation)
    if (reportedInputTokens === 0) continue
    if (generation.content === null || generation.inputContentState !== "captured") {
      unreadableGenerationCount += 1
      continue
    }
    const { atomIds, attributedTokens } = collectAtoms({
      messages: generation.content.inputMessages,
      countTokens,
      accumulator,
      spanId: generation.spanId,
    })
    ledgers.push({
      traceId: generation.traceId,
      spanId: generation.spanId,
      reportedInputTokens,
      atomIds,
      attributedTokens,
      residualTokens: Math.max(0, reportedInputTokens - attributedTokens),
      overshootTokens: Math.max(0, attributedTokens - reportedInputTokens),
      modelContextLimitTokens: generation.modelContextLimitTokens,
    })
  }

  return {
    generations: ledgers,
    atomsById: accumulator.atomsById,
    occurrencesByAtom: accumulator.occurrencesByAtom,
    readableInputTokens: ledgers.reduce((total, ledger) => total + ledger.reportedInputTokens, 0),
    readableGenerationCount: ledgers.length,
    unreadableGenerationCount,
  }
}

/**
 * Tokens an atom cost beyond the first prompt that needed it.
 *
 * The first occurrence is the work; every later one is the same content paid for again. Capped at
 * the atom's own size per repeat, so an approximate tokenizer cannot inflate a repeat into more
 * than the content it repeats.
 */
export const repeatedAtomTokens = ({
  ledger,
  atomId,
}: {
  readonly ledger: SessionContentLedger
  readonly atomId: string
}): number => {
  const atom = ledger.atomsById.get(atomId)
  const occurrences = ledger.occurrencesByAtom.get(atomId)?.length ?? 0
  return atom && occurrences > 1 ? atom.estimatedTokens * (occurrences - 1) : 0
}
