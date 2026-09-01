import { MOMENT_KINDS, type MomentLabelKind } from "@domain/conversation-intelligence"
import type { SessionDetail } from "@domain/spans"
import type { Effect } from "effect"
import type { FlaggerConversation } from "../conversation.ts"

type MomentHintKind = `moment:${MomentLabelKind}`

const STATIC_SESSION_HINT_KINDS = [
  "span:error",
  "tool:error",
  "tool:loop",
  "outlier:duration",
  "outlier:ttft",
  "outlier:tokens",
  "outlier:cost",
  "pattern:frustration",
  "pattern:refusal",
  "pattern:deferral",
  "pattern:injection",
  "pattern:nsfw",
  "pattern:pii",
] as const

export type SessionHintKind = (typeof STATIC_SESSION_HINT_KINDS)[number] | MomentHintKind

export const SESSION_HINT_KINDS: readonly SessionHintKind[] = [
  ...STATIC_SESSION_HINT_KINDS,
  ...MOMENT_KINDS.map((kind) => `moment:${kind}` as const),
]

// "Session went well" evidence: never a `hinted` trigger, only deprioritizes the
// sampled LLM budget. New moment kinds join the union automatically but default
// to negative — declare positive ones here.
export const POSITIVE_SESSION_HINT_KINDS = [
  "moment:user_satisfaction",
  "moment:resolution",
] as const satisfies readonly SessionHintKind[]

const POSITIVE_KIND_SET: ReadonlySet<SessionHintKind> = new Set(POSITIVE_SESSION_HINT_KINDS)

export const isPositiveSessionHintKind = (kind: SessionHintKind): boolean => POSITIVE_KIND_SET.has(kind)

export interface SessionHintAnchor {
  readonly messageIndex?: number | undefined
  readonly firstMessageIndex?: number | undefined
  readonly lastMessageIndex?: number | undefined
  readonly spanId?: string | undefined
  readonly toolCallId?: string | undefined
}

export interface SessionHint {
  readonly kind: SessionHintKind
  readonly anchor?: SessionHintAnchor | undefined
  readonly evidence?: string | undefined // short excerpt/metric, rendered into the classifier prompt
}

export interface SessionHintContext {
  readonly organizationId: string
  readonly projectId: string
  readonly sessionId: string
  readonly session: SessionDetail
  readonly conversation: FlaggerConversation
}

// Gatherers must be cheap (no LLM calls; embeddings only when precomputed) and
// handle their own failures — error `never`, degrading to zero hints.
export interface SessionHintGatherer<R = never> {
  readonly name: string
  readonly kinds: readonly SessionHintKind[]
  readonly gather: (ctx: SessionHintContext) => Effect.Effect<readonly SessionHint[], never, R>
}
