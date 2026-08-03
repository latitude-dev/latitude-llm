import { AI, resolveEmbeddingConfig } from "@domain/ai"
import { Effect } from "effect"
import type { MomentLabelKind as MomentKind } from "./entities/session-moment-label.ts"

interface MomentLabelAnchorConfig {
  readonly kind: MomentKind
  readonly actor: "user" | "assistant" | "unknown"
  readonly roles: readonly ("user" | "assistant" | "tool" | "system" | "unknown")[]
  readonly positiveAnchors: readonly string[]
  readonly contrastAnchors: readonly string[]
  readonly threshold: number
  readonly margin: number
  readonly summary: string
}

export const MOMENT_LABEL_ANCHORS: readonly MomentLabelAnchorConfig[] = [
  {
    kind: "escalation",
    actor: "unknown",
    roles: ["user", "assistant"],
    positiveAnchors: [
      "the user wants a human agent or manager to take over",
      "the customer asks to escalate the issue to support staff",
      "the assistant escalates transfers or hands off the conversation to a human support agent",
      "the assistant opens a support ticket or connects the customer to specialized staff",
    ],
    contrastAnchors: [
      "the user continues normal self service troubleshooting",
      "the assistant resolves the issue directly without human escalation",
    ],
    threshold: 0.58,
    margin: 0.06,
    summary: "Conversation indicates escalation or handoff",
  },
  {
    kind: "hesitation",
    actor: "user",
    roles: ["user"],
    positiveAnchors: ["the user is uncertain or confused about what to do next and asks for reassurance or guidance"],
    contrastAnchors: [
      "the user is confident and gives clear instructions",
      "the user clearly states what they want to return exchange cancel or change",
    ],
    threshold: 0.58,
    margin: 0.06,
    summary: "User shows hesitation or uncertainty",
  },
  {
    kind: "abandonment",
    actor: "unknown",
    roles: ["user", "assistant"],
    positiveAnchors: [
      "the user gives up withdraws the request or abandons the current goal",
      "the assistant indicates the conversation cannot continue because required information is missing or the user stopped responding",
      "the assistant closes the interaction after the user abandons the request",
    ],
    contrastAnchors: [
      "the user completes the request and continues productively",
      "the assistant completes the user's request successfully",
    ],
    threshold: 0.58,
    margin: 0.06,
    summary: "Conversation indicates abandonment of the current goal",
  },
  {
    kind: "user_frustration",
    actor: "user",
    roles: ["user"],
    positiveAnchors: [
      "the user expresses frustration annoyance or anger about the situation or the assistant's answers",
    ],
    contrastAnchors: ["the user communicates calmly and neutrally about their request"],
    threshold: 0.58,
    margin: 0.06,
    summary: "User expresses frustration",
  },
  {
    kind: "user_satisfaction",
    actor: "user",
    roles: ["user"],
    positiveAnchors: ["the user expresses satisfaction gratitude or confirms the help solved their problem"],
    contrastAnchors: ["the user remains frustrated or says the problem is not solved"],
    threshold: 0.58,
    margin: 0.06,
    summary: "User expresses satisfaction",
  },
  {
    kind: "resolution",
    actor: "user",
    roles: ["user", "assistant"],
    positiveAnchors: ["the user's issue is resolved completed or successfully answered"],
    contrastAnchors: ["the issue remains unresolved blocked or abandoned"],
    threshold: 0.58,
    margin: 0.06,
    summary: "Conversation moment indicates resolution",
  },
  {
    kind: "policy_refusal",
    actor: "assistant",
    roles: ["assistant"],
    positiveAnchors: ["the assistant refuses a request because of policy safety or permissions"],
    // Transfer/handoff is the confusable neighbour: refusing and escalating
    // both say "I can't do this" — the contrast anchor lets the margin gate
    // separate them (QA: transfer messages were labeled policy_refusal).
    contrastAnchors: [
      "the assistant fulfills the user's request normally",
      "the assistant transfers or escalates the conversation to a human agent",
    ],
    threshold: 0.58,
    margin: 0.06,
    summary: "Assistant refuses or cannot comply with a request",
  },
  {
    kind: "clarification_loop",
    actor: "assistant",
    roles: ["assistant"],
    positiveAnchors: [
      "the conversation is stuck in repeated clarification questions or missing information",
      "the assistant repeatedly asks the user to clarify or provide the same information again",
    ],
    contrastAnchors: ["the assistant has enough information and proceeds directly"],
    threshold: 0.58,
    margin: 0.03,
    summary: "Moment resembles a clarification loop",
  },
  {
    kind: "user_correction",
    actor: "user",
    roles: ["user"],
    positiveAnchors: [
      "the user corrects the assistant saying it got something wrong or misunderstood what was asked",
      "the user restates information they already provided because the assistant lost or ignored it",
    ],
    // clarification_loop is the confusable neighbour: there the ASSISTANT asks
    // again; here the USER asserts the fix.
    contrastAnchors: [
      "the user provides new information the assistant had not been given before",
      "the user answers a clarifying question from the assistant",
    ],
    threshold: 0.58,
    margin: 0.06,
    summary: "User corrects the assistant or restates lost information",
  },
  {
    kind: "stalling",
    actor: "assistant",
    roles: ["assistant"],
    positiveAnchors: [
      "the assistant asks the user to wait says one moment or that it is still working without delivering a result",
      "the assistant repeatedly says it is checking processing or looking into it without making progress",
    ],
    // hesitation is the user-side mirror of this assistant-actored kind.
    contrastAnchors: [
      "the assistant delivers the requested result or answer",
      "the assistant asks a specific question needed to proceed",
      "the assistant asks the user to repeat information needed to proceed",
    ],
    threshold: 0.58,
    margin: 0.06,
    summary: "Assistant stalls without delivering progress",
  },
]

export const embedAnchorText = (text: string) =>
  Effect.gen(function* () {
    const ai = yield* AI
    const embeddingConfig = yield* resolveEmbeddingConfig()
    const result = yield* ai.embed({
      text,
      provider: embeddingConfig.provider,
      model: embeddingConfig.model,
      inputType: "document",
    })
    return result.embedding
  })
