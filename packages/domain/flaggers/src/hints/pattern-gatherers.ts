import { Effect } from "effect"
import { FLAGGER_HINT_EVIDENCE_MAX_CHARS } from "../constants.ts"
import { extractJailbreakSuspiciousSnippets } from "../flagger-strategies/jailbreaking.ts"
import { extractNsfwSuspiciousSnippets } from "../flagger-strategies/nsfw.ts"
import { extractPiiSnippets } from "../flagger-strategies/pii-leakage.ts"
import {
  extractConversationStages,
  REFUSAL_PATTERN_SCORE_THRESHOLD,
  scoreRefusalLikelihood,
} from "../flagger-strategies/refusal.ts"
import { isRecord, iterMessageParts, type SuspiciousSnippet, truncateExcerpt } from "../flagger-strategies/shared.ts"
import type { SessionHint, SessionHintGatherer } from "./types.ts"

const MAX_HINTS_PER_PATTERN = 3

const evidence = (text: string): string => truncateExcerpt(text, FLAGGER_HINT_EVIDENCE_MAX_CHARS)

// Deliberately conservative (no caps-run/profanity detection — log pastes and
// excited users false-positive too often); a hit only raises a hint, the LLM
// judges whether the frustration targets the assistant.
const FRUSTRATION_USER_PATTERNS: readonly RegExp[] = [
  // Explicit human-escalation (the strongest signal in the literature)
  /\b(?:speak|talk|connect me) (?:to|with) (?:a |an )?(?:human|real person|live agent|person)\b/i,
  /\b(?:get|give) me (?:a |an )?(?:human|real person|live agent)\b/i,

  // Repetition / restatement — user has to re-assert
  /\bi (?:already|just) (?:told|said|asked|explained|mentioned)\b/i,
  /\bfor the (?:second|third|fourth|fifth|nth|last) time\b/i,
  /\bi (?:keep|have to keep) (?:telling|saying|asking|repeating)\b/i,

  // Direct dissatisfaction with the assistant's output. Constrain the subject so
  // domain complaints ("this volume is ridiculous", "the API is broken") do not
  // raise a hint — the LLM still judges target of frustration when other hints fire.
  /\b(?:this|that|it)\s+(?:is|are|was|were)\s+(?:useless|garbage|broken|terrible|awful|ridiculous|pointless|worthless)\b/i,
  /\b(?:you|this|that|it)'?s\s+(?:useless|garbage|broken|terrible|awful|ridiculous|pointless|worthless)\b/i,
  /\b(?:the )?(?:answer|response|output|suggestion|advice|result)\s+(?:is|are|was|were)\s+(?:useless|garbage|broken|terrible|awful|ridiculous|pointless|worthless)\b/i,
  /\byou'?re\s+(?:not (?:listening|reading|helping|understanding)|making (?:things|this) up|hallucinating|guessing)\b/i,
  /\bstop (?:hallucinating|guessing|making (?:things|stuff) up)\b/i,

  // Abandonment / give-up signals
  /\b(?:i'?ll|i will)\s+(?:do (?:it|this) myself|figure it out myself)\b/i,
  /\bnever ?mind\b/i,
  /\bforget (?:it|this)\b/i,
]

// These phrases appear in legitimate educational contexts too, so a hit only
// raises a hint — the LLM judges whether the request asked for finished work.
const LAZINESS_DEFERRAL_PATTERNS: readonly RegExp[] = [
  /\byou can (?:try|do|run|execute|write|implement|continue)\b/i,
  /\byou (?:could|should) (?:try|do|run|execute|write|implement|continue)\b/i,
  /\byou (?:may|might) (?:want to|consider) (?:trying|running|writing|implementing)\b/i,
  /\bhere'?s (?:how|what) you (?:would|could|can|should)\b/i,
  /\bhere'?s (?:a|an) (?:starting point|template|example|outline|skeleton|scaffold)\b/i,
  /\bas a starting point\b/i,
  /\buse (?:this|the following) as a (?:template|starting point|guide|reference)\b/i,
  /\bi'?ll (?:leave|let you|let the)\b/i,
  /\brefer to (?:the|your) (?:docs|documentation|api reference)\b/i,
  /\bcheck (?:the|your) (?:docs|documentation)\b/i,
  /\/\/ *(?:TODO|FIXME)[:\s]/i,
  /\/\/ *(?:your code|rest of|implementation|fill in|complete)\b/i,
  /#+ *(?:TODO|FIXME)[:\s]/i,
  /\.{3}\s*(?:and so on|etc\.?|repeat)\b/i,
]

const snippetHints = (kind: SessionHint["kind"], snippets: readonly SuspiciousSnippet[]): readonly SessionHint[] =>
  snippets.map((snippet) => ({
    kind,
    evidence: evidence(`${snippet.reason}: ${snippet.text}`),
  }))

export const frustrationPatternGatherer: SessionHintGatherer = {
  name: "frustration-pattern",
  kinds: ["pattern:frustration"],
  gather: (ctx) =>
    Effect.sync(() => {
      const hints: SessionHint[] = []
      const messages = ctx.conversation.allMessages
      for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
        const message = messages[messageIndex]!
        if (message.role !== "user") continue

        for (const part of iterMessageParts(message.parts)) {
          if (!isRecord(part) || part.type !== "text" || typeof part.content !== "string") continue
          const text = part.content.trim()
          if (!text || !FRUSTRATION_USER_PATTERNS.some((pattern) => pattern.test(text))) continue

          hints.push({ kind: "pattern:frustration", anchor: { messageIndex }, evidence: evidence(text) })
          break
        }
        if (hints.length >= MAX_HINTS_PER_PATTERN) break
      }
      return hints
    }),
}

export const refusalPatternGatherer: SessionHintGatherer = {
  name: "refusal-pattern",
  kinds: ["pattern:refusal"],
  gather: (ctx) =>
    Effect.sync(() => {
      const hints: SessionHint[] = []
      for (const stage of extractConversationStages(ctx.conversation)) {
        if (!stage.assistantMessage) continue
        const score = scoreRefusalLikelihood(stage)
        if (score < REFUSAL_PATTERN_SCORE_THRESHOLD) continue
        hints.push({
          kind: "pattern:refusal",
          evidence: evidence(`refusal-likelihood ${score}: ${stage.assistantMessage}`),
        })
        if (hints.length >= MAX_HINTS_PER_PATTERN) break
      }
      return hints
    }),
}

export const deferralPatternGatherer: SessionHintGatherer = {
  name: "deferral-pattern",
  kinds: ["pattern:deferral"],
  gather: (ctx) =>
    Effect.sync(() => {
      const hints: SessionHint[] = []
      for (const stage of extractConversationStages(ctx.conversation)) {
        const text = stage.assistantMessage
        if (!text || !LAZINESS_DEFERRAL_PATTERNS.some((pattern) => pattern.test(text))) continue
        hints.push({ kind: "pattern:deferral", evidence: evidence(text) })
        if (hints.length >= MAX_HINTS_PER_PATTERN) break
      }
      return hints
    }),
}

export const injectionPatternGatherer: SessionHintGatherer = {
  name: "injection-pattern",
  kinds: ["pattern:injection"],
  gather: (ctx) =>
    Effect.sync(() => snippetHints("pattern:injection", extractJailbreakSuspiciousSnippets(ctx.conversation))),
}

export const nsfwPatternGatherer: SessionHintGatherer = {
  name: "nsfw-pattern",
  kinds: ["pattern:nsfw"],
  gather: (ctx) => Effect.sync(() => snippetHints("pattern:nsfw", extractNsfwSuspiciousSnippets(ctx.conversation))),
}

export const piiPatternGatherer: SessionHintGatherer = {
  name: "pii-pattern",
  kinds: ["pattern:pii"],
  gather: (ctx) => Effect.sync(() => snippetHints("pattern:pii", extractPiiSnippets(ctx.conversation))),
}
