import { assistantTextMessage, type SeedMessage, toolResponseMessage, userTextMessage } from "../otlp.ts"
import type { SeededRng } from "../random.ts"
import type { LiveSeedFixtureDefinition, LiveSeedGeneratedCase } from "../types.ts"
import {
  buildConversationCase,
  type GeneratedConversationTurnDefinition,
  SUPPORT_SERVICE_NAME,
  SUPPORT_SYSTEM_INSTRUCTIONS,
} from "./common.ts"

/**
 * QA fixture for LAT-599 session-level search (PR 4 + future highlights work).
 *
 * Each case in this fixture is one *engineered* session: deterministic content,
 * deterministic session id prefix, and a known matching-trace count per query.
 * The companion checklist at `dev-docs/qa/session-search.md` references the
 * session ids and expected counts by name — keep the two in sync when editing.
 *
 * No flagger samples → these sessions don't pollute the system queues; they
 * only carry conversation content for the search worker to index.
 */

const TURN_GAP_RANGE_MS = [800, 1_400] as const
const STANDARD_DURATION_RANGE_MS = [900, 1_500] as const
const START_DELAY_RANGE_MS = [200, 600] as const

type VariantBuilder = (input: {
  readonly rng: SeededRng
  readonly fixtureKey: string
  readonly replicaIndex: number
}) => LiveSeedGeneratedCase

function withSessionId(generated: LiveSeedGeneratedCase, sessionId: string): LiveSeedGeneratedCase {
  return {
    ...generated,
    sessionId,
  }
}

function turn(key: string, user: string, assistant: string): GeneratedConversationTurnDefinition {
  return {
    key,
    inputAdditions: [userTextMessage(user)],
    outputMessages: [assistantTextMessage(assistant)],
    durationRangeMs: STANDARD_DURATION_RANGE_MS,
    gapAfterRangeMs: TURN_GAP_RANGE_MS,
    usageProfile: "tiny" as const,
  }
}

function buildSupportCase(input: {
  readonly rng: SeededRng
  readonly fixtureKey: string
  readonly turns: readonly GeneratedConversationTurnDefinition[]
  readonly targetTurnIndex: number
  readonly sessionId: string
}): LiveSeedGeneratedCase {
  const generated = buildConversationCase({
    rng: input.rng,
    fixtureKey: input.fixtureKey,
    family: "support",
    serviceName: SUPPORT_SERVICE_NAME,
    systemInstructions: SUPPORT_SYSTEM_INSTRUCTIONS,
    turns: input.turns,
    targetTurnIndex: input.targetTurnIndex,
    startDelayRangeMs: START_DELAY_RANGE_MS,
    traits: {
      highCost: false,
      supportService: true,
    },
  })

  return withSessionId(generated, input.sessionId)
}

const buildRefund4Case: VariantBuilder = ({ rng, fixtureKey, replicaIndex }) => {
  const turns: readonly GeneratedConversationTurnDefinition[] = [
    turn(
      "refund-open",
      "I need a refund for the payment I made last Tuesday — the charge was duplicated.",
      "I'm sorry about the duplicate charge. Let me look up the refund options for that payment.",
    ),
    turn(
      "refund-process",
      "Can you process the refund to my original card? The dispute is for $42.30.",
      "Refund initiated to your original card for $42.30. Processing time is 3-5 business days.",
    ),
    turn(
      "refund-escalate",
      "I haven't received the refund yet. The dispute has been open for a week.",
      "I'll escalate the refund request. The dispute team will contact you within 24 hours.",
    ),
    turn(
      "refund-confirm",
      "Thanks. Please confirm the refund tracking number.",
      "Refund tracking number is RFD-2026-0512-0042. You should receive an email shortly.",
    ),
  ]

  return buildSupportCase({
    rng,
    fixtureKey,
    turns,
    targetTurnIndex: 0,
    sessionId: `qa-refund-4-${(replicaIndex + 1).toString()}`,
  })
}

const buildCode3Case: VariantBuilder = ({ rng, fixtureKey, replicaIndex }) => {
  // Negative control: TypeScript + React content, no refund/payment vocabulary.
  const turns: readonly GeneratedConversationTurnDefinition[] = [
    turn(
      "hook-basics",
      "Help me write a custom React hook for debounced input.",
      "Here's a useDebouncedValue hook that delays state updates by the specified ms.",
    ),
    turn(
      "hook-form",
      "How do I integrate that with React Hook Form?",
      "Wrap the controlled input with useController and feed the debounced value as the form value.",
    ),
    turn(
      "hook-generics",
      "What about TypeScript generics for the value type?",
      "Parameterize useDebouncedValue<T>(value: T, delay: number): T.",
    ),
  ]

  return buildSupportCase({
    rng,
    fixtureKey,
    turns,
    targetTurnIndex: 0,
    sessionId: `qa-code-3-${(replicaIndex + 1).toString()}`,
  })
}

const buildMixed6Case: VariantBuilder = ({ rng, fixtureKey, replicaIndex }) => {
  // 6 turns; only turns 3 and 5 mention "refund". Used to verify
  // matchingTraceCount === 2 (not 6) on a "refund" query.
  const turns: readonly GeneratedConversationTurnDefinition[] = [
    turn(
      "onboarding-sso",
      "How do I configure SSO for my workspace?",
      "Open Settings → Authentication and connect your IdP via SAML or OIDC.",
    ),
    turn(
      "onboarding-roles",
      "What roles can I assign to team members?",
      "We support owner, admin, member, and viewer. Each role has different scopes.",
    ),
    turn(
      "refund-mention-1",
      "Quick aside — there's a refund I'm waiting on from last month. Is that handled somewhere else?",
      "Refunds are processed by the billing team; I can flag a note for them but it's a separate workflow.",
    ),
    turn(
      "onboarding-api-keys",
      "Back to onboarding — where do I rotate API keys?",
      "Settings → API Keys → Rotate. Old keys remain valid for 24 hours after rotation.",
    ),
    turn(
      "refund-mention-2",
      "Got it. And where can I see outstanding billing items?",
      "You can also track open refund requests in the billing tab under Account → Billing → Disputes.",
    ),
    turn(
      "onboarding-wrap",
      "Thanks, that covers everything for now.",
      "Glad to help. Let me know if you need anything else as you finish setup.",
    ),
  ]

  return buildSupportCase({
    rng,
    fixtureKey,
    turns,
    targetTurnIndex: 2,
    sessionId: `qa-mixed-6-${(replicaIndex + 1).toString()}`,
  })
}

const buildCancellation5Case: VariantBuilder = ({ rng, fixtureKey, replicaIndex }) => {
  // Pure-semantic target. None of the literal words from the canonical QA
  // semantic query — "customer wanted their money back", and specifically
  // the tokens "refund", "money", "back" — appear anywhere in this session.
  // The query has to ride the cosine signal carried by adjacent vocabulary:
  // "cancel", "subscription", "reverse", "chargeback", "credit",
  // "reimbursement", "reversal", "billing". When tweaking these turns, keep
  // that lexical exclusion intact or the session stops being pure-semantic.
  const turns: readonly GeneratedConversationTurnDefinition[] = [
    turn(
      "cancel-open",
      "I want to cancel my subscription and receive a full reimbursement for the last billing cycle.",
      "I can help with cancellation. Could you share your account email so I can pull up the subscription?",
    ),
    turn(
      "cancel-reverse",
      "Can you stop the recurring charges and reverse last month's billing?",
      "I'll stop the recurring charges right away. For the prior month's billing, I'll start a reversal request.",
    ),
    turn(
      "cancel-chargeback",
      "I'm requesting a chargeback because I never used the service.",
      "Noted — I'll log the chargeback request. Note that chargebacks initiated through your bank can take 30-45 days.",
    ),
    turn(
      "cancel-credit",
      "Just credit the full amount to my card. I shouldn't have to pay for something I didn't use.",
      "Understood. I'll submit the full credit to your original payment method for the unused period.",
    ),
    turn(
      "cancel-confirm",
      "Send me an email when it's all settled.",
      "Will do. You'll receive a confirmation once the reversal posts and the subscription is fully terminated.",
    ),
  ]

  return buildSupportCase({
    rng,
    fixtureKey,
    turns,
    targetTurnIndex: 0,
    sessionId: `qa-cancellation-5-${(replicaIndex + 1).toString()}`,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// qa-oversized-collapsed: one trace, one ~28k-char assistant message
// ─────────────────────────────────────────────────────────────────────────────
//
// Engineered for the LAT-601 highlights PR3 manual QA. The assistant message
// exceeds `LARGE_MARKDOWN_CONTENT_THRESHOLD` (20_000 chars in @repo/utils),
// triggering `MarkdownContent`'s head + collapsed-middle + tail split path
// (`packages/ui/src/components/genai-conversation/parts/markdown-content.tsx`).
// "refund" is planted at three offsets — one each in the head, the collapsed
// middle, and the tail — so a `"refund"` search exercises:
//   - inline chip rendering in head + tail (visible by default)
//   - the "Show N more characters · M matches hidden" affordance for the
//     hidden middle hit
//   - auto-expand of the middle when `firstMatchIndex` lands inside it (drop
//     the head sentence locally to test this branch)
// It also doubles as the trace for the pre-PR3 oversized-part annotation bug
// fix: select text in the head or tail, create an annotation, reload — the
// annotation should now render (it silently dropped before PR3).

const FILLER_SENTENCES: readonly string[] = [
  "Our customer success team handles every account inquiry with care and complete attention.",
  "Billing concerns, subscription adjustments, and account access are all addressed within our service window.",
  "We aim to respond to every ticket within one business day under standard plans.",
  "For enterprise accounts, the response window is reduced to four hours during business days.",
  "Our knowledge base contains over five hundred articles covering common workflow questions.",
  "Self-service portals allow you to update payment methods, change billing cycles, or pause subscriptions without escalating to support.",
  "Audit logs are available for the past ninety days under all plan tiers, with extended retention available as an add-on.",
  "Security policies require multi-factor authentication for all administrative actions across the platform.",
  "Data residency options are available for customers with regional compliance requirements such as GDPR or HIPAA.",
  "Service-level agreements are negotiated separately and detailed in the master subscription agreement.",
  "API rate limits scale with plan tier; contact your account manager for raised quotas during product launches.",
  "Webhook deliveries retry up to five times with exponential backoff before being marked as permanently failed.",
] as const

const REFUND_HEAD_SENTENCE =
  "\n\nNote on refunds: our refund policy applies to all charges initiated within the last thirty days. Duplicate refund requests filed during that window are processed automatically through our standard refund flow.\n\n"
const REFUND_MIDDLE_SENTENCE =
  "\n\nFor cases where the refund escalates to the chargeback team, please allow five to seven business days for the refund to clear. The refund team reviews each case manually before issuing the final refund authorization.\n\n"
const REFUND_TAIL_SENTENCE =
  "\n\nFinal note on this specific refund: a refund tracking number will be sent to your registered email address once the refund posts to your original payment card. Reply to this thread if the refund does not appear within the expected window.\n\n"

const OVERSIZED_TARGET_LENGTH = 28_000
const OVERSIZED_HEAD_OFFSET = 3_000
const OVERSIZED_MIDDLE_OFFSET = 15_000
const OVERSIZED_TAIL_OFFSET = 27_000

function buildOversizedTicketBody(): string {
  const parts: string[] = []
  let len = 0
  let sentenceIndex = 0
  let insertedHead = false
  let insertedMiddle = false
  let insertedTail = false

  while (len < OVERSIZED_TARGET_LENGTH) {
    if (!insertedHead && len >= OVERSIZED_HEAD_OFFSET) {
      parts.push(REFUND_HEAD_SENTENCE)
      len += REFUND_HEAD_SENTENCE.length
      insertedHead = true
      continue
    }
    if (!insertedMiddle && len >= OVERSIZED_MIDDLE_OFFSET) {
      parts.push(REFUND_MIDDLE_SENTENCE)
      len += REFUND_MIDDLE_SENTENCE.length
      insertedMiddle = true
      continue
    }
    if (!insertedTail && len >= OVERSIZED_TAIL_OFFSET) {
      parts.push(REFUND_TAIL_SENTENCE)
      len += REFUND_TAIL_SENTENCE.length
      insertedTail = true
      continue
    }
    const sentence = `${FILLER_SENTENCES[sentenceIndex % FILLER_SENTENCES.length] ?? ""} `
    parts.push(sentence)
    len += sentence.length
    sentenceIndex++
  }

  return parts.join("")
}

const OVERSIZED_TICKET_BODY = buildOversizedTicketBody()

const buildOversizedCollapsed1Case: VariantBuilder = ({ rng, fixtureKey, replicaIndex }) => {
  const turns: readonly GeneratedConversationTurnDefinition[] = [
    {
      key: "oversized-ticket",
      inputAdditions: [
        userTextMessage("Can you walk me through the full refund policy in detail? I want the complete picture."),
      ],
      outputMessages: [assistantTextMessage(OVERSIZED_TICKET_BODY)],
      durationRangeMs: STANDARD_DURATION_RANGE_MS,
      gapAfterRangeMs: TURN_GAP_RANGE_MS,
      usageProfile: "tiny" as const,
    },
  ]

  return buildSupportCase({
    rng,
    fixtureKey,
    turns,
    targetTurnIndex: 0,
    sessionId: `qa-oversized-collapsed-${(replicaIndex + 1).toString()}`,
  })
}

const buildDeep20Case: VariantBuilder = ({ rng, fixtureKey, replicaIndex }) => {
  // 20 turns. The literal word "refund" appears in exactly turns 5, 12, and 18
  // (1-indexed). Turn 12 is the *densest* refund mention so it should rank as
  // the highest-relevance match — this is the future QA target for
  // `./specs/session-problems/5-search-highlights.md` Phase A (scroll-to-match).
  // Filler topics rotate so semantic queries like "recipe" hit only this session.
  const turns: readonly GeneratedConversationTurnDefinition[] = [
    turn(
      "deep-01-recipe",
      "Do you have a quick tomato soup recipe?",
      "Sure — sauté onion and garlic, add canned tomatoes, simmer 15 minutes, blend smooth, season with basil.",
    ),
    turn(
      "deep-02-weather",
      "What's the weather usually like in Lisbon in May?",
      "Mild and sunny — typically 18-24°C, low rainfall, perfect for walking around the old town.",
    ),
    turn(
      "deep-03-history",
      "Who was the first emperor of Rome?",
      "Augustus, born Gaius Octavius, who became emperor in 27 BCE after the fall of the Republic.",
    ),
    turn(
      "deep-04-code-snippet",
      "Show me how to read a file in Node.js.",
      "Use `import { readFile } from 'node:fs/promises'` and `await readFile(path, 'utf8')` for text.",
    ),
    turn(
      "deep-05-refund-1",
      "Side question — I asked about a refund last week, any update?",
      "Let me check the refund status for you — one moment.",
    ),
    turn(
      "deep-06-music",
      "Recommend a jazz album from the 60s.",
      "Try 'A Love Supreme' by John Coltrane (1965) — it's a landmark of spiritual jazz.",
    ),
    turn(
      "deep-07-gardening",
      "When should I plant tomatoes?",
      "After the last frost — usually late April to mid-May in temperate climates.",
    ),
    turn(
      "deep-08-travel",
      "What's the best way to get from Paris to Lyon?",
      "TGV high-speed train from Gare de Lyon — about 2 hours direct.",
    ),
    turn(
      "deep-09-recipe-2",
      "Any tips for a fluffy omelette?",
      "Whisk eggs hard, use butter in a hot pan, and pull the curds in as they set — keep it moving.",
    ),
    turn(
      "deep-10-astronomy",
      "Why is the sky blue?",
      "Rayleigh scattering — shorter wavelengths (blue) scatter more in the atmosphere than longer ones.",
    ),
    turn(
      "deep-11-typescript",
      "What's a discriminated union in TypeScript?",
      "A union of object types that share a common literal property used to narrow the type at runtime.",
    ),
    turn(
      "deep-12-refund-2",
      "I really need to follow up on that refund — the duplicate charge refund from last month. The dispute team mentioned a refund tracking number but I never received the refund confirmation email. Can you reopen the refund ticket and tell me when the refund will actually post?",
      "I've reopened the refund ticket and re-queued the refund for processing. The refund should post to your card within 2 business days; you'll get a refund confirmation by email as soon as it clears.",
    ),
    turn(
      "deep-13-books",
      "Recommend a sci-fi novel about first contact.",
      "Try 'The Sparrow' by Mary Doria Russell or 'Story of Your Life' by Ted Chiang.",
    ),
    turn(
      "deep-14-recipe-3",
      "How do I make pizza dough?",
      "Flour, water, salt, yeast — knead 10 minutes, rise 1 hour, shape, bake at the hottest temp your oven supports.",
    ),
    turn(
      "deep-15-fitness",
      "Best exercise for lower back pain?",
      "Glute bridges and dead bugs — strengthen the posterior chain without compressing the spine.",
    ),
    turn(
      "deep-16-language",
      "How do you say 'thank you' in Portuguese?",
      "'Obrigado' if you're male, 'obrigada' if you're female — gender matches the speaker.",
    ),
    turn(
      "deep-17-photography",
      "What aperture for portraits?",
      "f/1.8 to f/2.8 if you want shallow depth of field with creamy background blur.",
    ),
    turn(
      "deep-18-refund-3",
      "One last thing on the refund — is there a way to track it in the app?",
      "Yes, go to Account → Billing → Disputes; the refund will show there once it's posted.",
    ),
    turn(
      "deep-19-coffee",
      "What's the difference between espresso and ristretto?",
      "Ristretto is a shorter, more concentrated pull — about half the water for the same dose of coffee.",
    ),
    turn("deep-20-wrap", "Thanks, that's all for now.", "You're welcome — feel free to come back any time."),
  ]

  return buildSupportCase({
    rng,
    fixtureKey,
    turns,
    targetTurnIndex: 11, // turn 12 — densest refund language (highlights QA target)
    sessionId: `qa-deep-20-${(replicaIndex + 1).toString()}`,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// qa-tool-reasoning-indexing: lexical-only paths through reasoning + tool response
// ─────────────────────────────────────────────────────────────────────────────
//
// QA target for the lexical/embedding formatter split in
// `packages/domain/spans/src/use-cases/build-trace-search-document.ts`. Both
// the reasoning content and the tool-call response payload contain searchable
// tokens that DO NOT appear anywhere else in the conversation. The final
// assistant reply paraphrases the result in normal prose, so substring
// searches against the model's "backstage" content used to silently miss
// before the formatter split landed.
//
// Search queries to exercise:
//   - `"PAYMENT_DECLINED"` (literal, only in tool_call_response) → finds the trace
//   - `"backstage thought"` (literal, only in reasoning)         → finds the trace
//   - `` `private chain` `` (token, only in reasoning)            → finds the trace
//   - `"insufficient funds"` (literal, in the final assistant text) →
//                                                                  finds the trace
//                                                                  (worked before
//                                                                  the formatter
//                                                                  split too)
//
// Known UX gap (out of scope for this fix): highlights for the reasoning
// panel and tool-response panel don't render inline yet because those parts
// render through non-instrumented components (no `data-source-start`
// attributes). Search MATCHES the trace; the user sees no chip in the
// conversation drawer for reasoning / tool-response hits — only for the
// regular assistant text hit. Track as follow-up.

const TOOL_REASONING_CALL_ID = "tc-payment-1" as const

function buildAssistantPlanningMessage(): SeedMessage {
  return {
    role: "assistant",
    parts: [
      {
        type: "reasoning",
        content:
          "Need to check the payment ledger. The user's account shows a private chain of failed retries against the card. Let me query the payment service to get the precise decline reason before answering — this kind of backstage thought helps me phrase the reply carefully without leaking internal codes to the user.",
      },
      { type: "text", content: "Let me check that for you." },
      {
        type: "tool_call",
        id: TOOL_REASONING_CALL_ID,
        name: "get_payment_status",
        arguments: { accountId: "acc-789" },
      },
    ],
  }
}

const buildToolReasoningIndexingCase: VariantBuilder = ({ rng, fixtureKey, replicaIndex }) => {
  const planning = buildAssistantPlanningMessage()
  const toolResult = toolResponseMessage(TOOL_REASONING_CALL_ID, {
    status: "DECLINED",
    reason: "PAYMENT_DECLINED",
    errorCode: "ERR_INSUFFICIENT_FUNDS",
    lastTryAt: "2026-05-21T14:32:00Z",
    retryCount: 3,
  })
  const finalReply = assistantTextMessage(
    "Your last payment was declined because of insufficient funds. Top up the card balance and retry from the billing tab.",
  )

  const turns: readonly GeneratedConversationTurnDefinition[] = [
    {
      key: "tool-reasoning-flow",
      inputAdditions: [userTextMessage("Why was my last payment declined?")],
      // One logical turn that emits an assistant planning message (with
      // reasoning + text + tool_call), the tool response, then the
      // assistant's final paraphrased reply.
      outputMessages: [planning, toolResult, finalReply],
      durationRangeMs: STANDARD_DURATION_RANGE_MS,
      gapAfterRangeMs: TURN_GAP_RANGE_MS,
      usageProfile: "tiny" as const,
    },
  ]

  return buildSupportCase({
    rng,
    fixtureKey,
    turns,
    targetTurnIndex: 0,
    sessionId: `qa-tool-reasoning-indexing-${(replicaIndex + 1).toString()}`,
  })
}

const VARIANT_BUILDERS: readonly VariantBuilder[] = [
  buildRefund4Case,
  buildCode3Case,
  buildMixed6Case,
  buildCancellation5Case,
  buildDeep20Case,
  buildOversizedCollapsed1Case,
  buildToolReasoningIndexingCase,
]

const SESSION_VARIANT_COUNT = VARIANT_BUILDERS.length

export const sessionSearchQaFixture: LiveSeedFixtureDefinition = {
  key: "session-search-qa",
  description:
    "QA-only fixture: 6 engineered sessions (refund-heavy, control, mixed, semantic-only, deep, oversized-collapsed) for LAT-599 session-search + LAT-601 highlights verification. See dev-docs/qa/session-search.md.",
  // No flagger samples → these sessions don't trip any system queue. Pure
  // conversation content for the search worker to index.
  sampling: {
    flaggerSamples: {
      frustration: false,
    },
  },
  deterministicFlaggerMatches: [],
  llmSystemIntents: [],
  // `instanceIndex` cycles through the 6 variants in order. `--count-per-fixture 6`
  // produces exactly one of each (qa-refund-4-1, qa-code-3-1, qa-mixed-6-1,
  // qa-cancellation-5-1, qa-deep-20-1, qa-oversized-collapsed-1). Higher
  // counts wrap around with the suffix incrementing (qa-refund-4-2, etc.).
  generateCase: ({ rng, fixtureKey, instanceIndex }) => {
    const variantIndex = instanceIndex % SESSION_VARIANT_COUNT
    const replicaIndex = Math.floor(instanceIndex / SESSION_VARIANT_COUNT)
    const builder = VARIANT_BUILDERS[variantIndex]
    if (!builder) {
      throw new Error(`session-search-qa: missing builder for variantIndex=${variantIndex.toString()}`)
    }

    return builder({ rng, fixtureKey, replicaIndex })
  },
}
