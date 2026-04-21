# System Queue Flagger Redesign

> **Documentation**: `docs/annotation-queues.md`, `docs/reliability.md`, `docs/ai-generation-features.md`

## Spec Contract

This spec defines the phased redesign of the system queue flagger so queue matching no longer relies on one shared prompt shape for every LLM-backed queue.

The redesign must preserve the external workflow contract (`runSystemQueueFlaggerUseCase` still returns `{ matched: boolean }`) while allowing each queue slug to choose the cheapest reliable strategy for its failure mode:

- deterministic match
- deterministic no-match
- LLM fallback with a queue-specific prompt and input payload

## Problem

The current system queue flagger was originally designed around one shared prompt template plus one shared trace-summary payload. That shape is too generic and too expensive for the queues now in scope:

- `frustration` is best detected from the user's own wording, not a trace summary
- `refusal` and `laziness` can happen at any stage of the conversation, not only in the final exchange
- `nsfw` should broaden from strictly sexual content toward workplace-inappropriate / toxic text and should use deterministic fast-paths where possible
- `jailbreaking` should cover both direct user-authored attempts and indirect prompt injection arriving through tool or retrieved content

The redesign should reduce prompt tokens, improve queue-specific precision, and make deterministic gates first-class where they clearly fit the problem.

## Accepted Decisions

- `frustration` already moved off the shared trace summary and now uses a user-message-only prompt; that work is part of this roadmap's baseline
- `refusal` and `laziness` incidents count even if they happen early in the conversation and the assistant later recovers
- `jailbreaking` should cover both direct and indirect prompt injection
- the queue name `NSFW` stays unchanged, but its description/instructions should broaden toward workplace-inappropriate or toxic text in the style of OpenAI Guardrails' softer `NSFW Text` direction
- trusted, well-proven dependencies are allowed when they solve a narrow part of the problem cleanly
- plan around adopting `obscenity` for deterministic profanity / obscenity detection unless implementation-time evaluation reveals an unacceptable precision problem
- do not plan around heavy local ML dependencies such as `@tensorflow-models/toxicity`
- do not depend on immature all-in-one guardrail frameworks for core queue behavior; keep queue routing and prompt design repo-owned
- queue-specific LLM prompts should default to no reasoning output, tight bounded context, and no global trace metadata unless that queue specifically needs it

## Dependency Policy

### Adopt by default

- `obscenity`
  - purpose: deterministic profanity / obscenity matching for the broadened `nsfw` queue
  - rationale: mature enough, recent releases, MIT, zero runtime deps, TypeScript-friendly, and narrow in scope

### Optional narrow supplement

- `@promptshield/core`
  - purpose: hidden Unicode / BIDI / homoglyph / content-smuggling signals for jailbreak detection
  - rationale: useful only for a narrow slice of indirect prompt injection; do not make it the primary jailbreak detector

### Explicitly not planned

- `@tensorflow-models/toxicity`
  - too old and heavy for this runtime path
- broad all-in-one guardrail libraries as the main implementation strategy
  - useful for inspiration, not for the core queue matcher architecture

## Target Architecture

The flagger should move to an internal per-queue strategy registry. Each queue strategy may implement any mix of these behaviors:

- `hasRequiredContext(trace)`
- `detectDeterministically(trace)` returning one of:
  - matched
  - no-match
  - ambiguous, continue to LLM
- `buildSystemPrompt(trace)`
- `buildPrompt(trace)`

The strategy registry remains an internal detail of `run-system-queue-flagger.ts`; the external use-case contract and workflow payloads stay unchanged.

Shared internal helpers should extract the smallest context that still supports a correct decision:

- text-only user/assistant message filtering
- conversation stage extraction (`user block -> assistant block`)
- stage ranking for `refusal` and `laziness`
- suspicious snippet extraction for `nsfw` and `jailbreaking`
- compact work signals (`tool_calls`, `tools_used`, `assistant_messages`) for `laziness`

New named constants should cap stage counts, snippet counts, and excerpt sizes so token budgets stay deterministic.

## Queue Strategies

### Frustration

Keep the recently added custom strategy:

- input: user messages only
- no AI call when the trace contains no user messages
- no shared trace summary

### NSFW

Broaden the queue semantics toward workplace-inappropriate or toxic text while keeping the queue name `NSFW`.

Primary strategy:

- deterministic scan over text-only user/assistant messages
- use `obscenity` for profanity / obscenity matching
- add repo-owned high-precision rules for:
  - explicit sexual content
  - abusive harassment
  - hate / identity-based slurs
  - graphic violent language

LLM fallback:

- only when the trace contains suspicious text but deterministic rules are inconclusive
- send only local suspicious text excerpts
- do not send system prompt excerpts, trace metadata, or tool summaries

Do not match:

- benign anatomy or health discussion
- mild romance
- neutral policy/safety discussion about unsafe content
- non-abusive colloquial language without clear toxicity

### Refusal

Use a multi-stage LLM prompt over the most suspicious conversation stages.

Stage shape:

- contiguous user message block
- following assistant reply block

Candidate ranking should prioritize assistant replies with refusal-like wording. Only the top `K` stages should be sent to the model; initial plan: `K = 3`.

The prompt should match when any candidate stage shows an incorrect refusal, deflection, or over-restriction of an otherwise allowed/answerable request. Later recovery does not erase the incident.

Do not match:

- correct safety refusals
- unsupported or permission-blocked requests
- missing-context blockers

### Laziness

Use the same multi-stage extraction shape as `refusal`, but rank stages by likely low-effort or punt behavior.

Each candidate stage should carry compact work signals:

- `tool_calls`
- `tools_used`
- `assistant_messages`

The prompt should match when any candidate stage shows the assistant avoiding work, stopping early without justification, giving a shallow partial answer, or pushing obvious work back to the user. Later recovery does not erase the incident.

Do not match:

- explicit refusal that belongs in the `refusal` queue
- genuine blockers caused by missing access, missing context, or policy constraints

### Jailbreaking

Use a hybrid direct + indirect detection strategy.

Deterministic layer:

- high-precision direct jailbreak phrases and patterns in user-authored content
- high-precision indirect injection patterns in tool / retrieved / web content already present in the trace
- optional hidden-text signals from `@promptshield/core` only if implementation-time evaluation shows clear value

LLM fallback:

- only for suspicious-but-ambiguous cases
- use extracted suspicious snippets with source labels such as `user`, `tool`, or `assistant`
- include compact local context only when needed to disambiguate manipulation from benign discussion

Match scope includes:

- prompt injection
- instruction hierarchy attacks
- policy-evasion attempts
- role or identity escape
- tool abuse intended to bypass guardrails
- assistant behavior that follows those attempts

Do not match:

- harmless roleplay
- benign security discussion about jailbreaks or prompt injection
- ordinary unsafe requests that the assistant correctly refuses

## Out Of Scope

- redesigning the annotator (`runSystemQueueAnnotatorUseCase`) in this spec
- redesigning `forgetting` or `trashing` beyond keeping them on their current strategies for now
- introducing external moderation APIs or hosted classifiers
- changing workflow payloads or public API contracts for system queue evaluation

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`
>
> Each phase is intended to become one GitHub PR. Phase headings use placeholder ids until the user asks for any issue tracker sync.

### (LAT-XXX) Phase 0 - Frustration Baseline

**Depends on**: none

**Parallelization notes**: already landed; later phases should build on its queue-specific strategy pattern rather than reintroducing a shared prompt shape.

- [x] Move `frustration` to a user-message-only prompt.
- [x] Skip the AI call for `frustration` when the trace contains no user messages.
- [x] Add focused tests proving assistant messages are excluded from the `frustration` prompt.

**Exit gate**:

- `frustration` no longer relies on the shared trace summary and the regression tests are green.

### (LAT-XXX) Phase 1 - Strategy Foundations

**Depends on**: Phase 0

**Parallelization notes**: phases 2 through 5 should wait for this phase to settle the shared internal extraction and routing model.

- [x] Introduce an internal per-queue strategy contract in `run-system-queue-flagger.ts` that supports deterministic short-circuits plus queue-specific LLM fallback without changing the external use-case contract.
- [x] Add shared extraction helpers for text-only message filtering, conversation stage extraction, suspicious snippet extraction, and compact work-signal summaries.
- [x] Add named constants for stage count caps, suspicious snippet caps, and excerpt-size limits so token budgets are explicit and testable.
- [x] Evaluate `obscenity` in-package against representative benign and toxic examples; adopt it if the precision is acceptable, otherwise document a repo-owned fallback strategy before proceeding.
- [x] Add queue-level tests that fail if custom prompts accidentally regress back to the old shared trace-summary payload.

**Exit gate**:

- the flagger has a stable internal strategy registry, bounded extraction helpers, and a settled dependency decision for `obscenity`.

### (LAT-XXX) Phase 2 - NSFW Hybrid Gate And Queue Copy

**Depends on**: Phase 1

**Parallelization notes**: can run in parallel with phases 3 through 5 once phase 1 lands.

- [x] Broaden the `NSFW` queue description and instructions in `constants.ts`, `docs/annotation-queues.md`, and `specs/reliability.md` while keeping the queue name unchanged.
- [x] Implement deterministic text-only `nsfw` detection using `obscenity` for profanity / obscenity plus repo-owned high-precision rules for sexual content, harassment, slurs, and graphic violent language.
- [x] Route deterministic positives directly to `{ matched: true }` and deterministic clean traces to `{ matched: false }`.
- [x] Add a queue-specific LLM fallback prompt for ambiguous `nsfw` cases using only suspicious text excerpts and no shared trace metadata.
- [x] Add focused tests for explicit profanity, explicit sexual content, abusive harassment, benign anatomy/health discussion, mild romance, and ambiguous borderline cases that should exercise the LLM fallback path.

**Exit gate**:

- `nsfw` acts as a hybrid workplace-inappropriate / toxic text detector, the queue copy matches the broadened behavior, and the LLM fallback stays narrow and text-only.

### (LAT-XXX) Phase 3 - Refusal Multi-Stage Classifier

**Depends on**: Phase 1

**Parallelization notes**: can run in parallel with phases 2, 4, and 5 once phase 1 lands.

- [x] Segment traces into conversation stages (`user block -> assistant block`) and rank likely refusal stages by assistant-language heuristics.
- [x] Build a refusal-specific prompt that evaluates only the top-ranked stages; initial cap: top `3` stages.
- [x] Encode refusal-specific negative guidance for correct safety refusals, unsupported tasks, permission blockers, and missing-context blockers.
- [x] Ensure later recovery does not erase an earlier incorrect refusal.
- [x] Add tests for early incorrect refusal with later recovery, correct unsafe refusal, and harmless request plus explicit refusal.

**Exit gate**:

- `refusal` no longer relies on the shared trace summary and correctly detects incidents anywhere in the conversation without conflating them with genuine safety or capability limits.

### (LAT-XXX) Phase 4 - Laziness Multi-Stage Classifier

**Depends on**: Phase 1

**Parallelization notes**: can run in parallel with phases 2, 3, and 5 once phase 1 lands.

- [x] Reuse the shared stage extraction shape and rank likely laziness stages by punt/shallow-answer patterns plus lack-of-work signals.
- [x] Include compact per-stage work signals (`tool_calls`, `tools_used`, `assistant_messages`) in the laziness-specific prompt.
- [x] Encode negative guidance that separates laziness from explicit refusal and from genuine missing-access / missing-context / policy blockers.
- [x] Ensure later recovery does not erase an earlier laziness incident.
- [x] Add tests for early laziness with later recovery, shallow answer without meaningful work, and genuine blockers that must not match.

**Exit gate**:

- `laziness` uses a bounded stage-based prompt with compact work signals and correctly distinguishes laziness from refusal and legitimate blockers.

### (LAT-XXX) Phase 5 - Jailbreaking Hybrid Direct And Indirect Detection

**Depends on**: Phase 1

**Parallelization notes**: can run in parallel with phases 2 through 4 once phase 1 lands.

- [x] Implement high-precision deterministic jailbreak heuristics for direct override / extraction / bypass patterns in user-authored content.
- [x] Implement high-precision indirect-injection heuristics over tool, retrieved, or web-originated content already present in the trace.
- [~] Evaluate whether `@promptshield/core` adds meaningful hidden-text / Unicode attack coverage; adopt it only behind a narrow helper if the benefit is material and the added precision justifies the new dependency. *Deferred: can be added later without breaking changes.*
- [x] Build a jailbreak-specific LLM fallback prompt over suspicious snippets with source labels (`user`, `tool`, `assistant`) instead of the old shared trace summary.
- [x] Add tests for direct prompt injection, indirect tool-output injection, benign prompt-injection discussion, and harmless roleplay.

**Exit gate**:

- `jailbreaking` covers direct and indirect manipulation attempts through a hybrid deterministic + LLM strategy without regressing into a full trace-summary prompt.

### (LAT-XXX) Phase 6 - Cleanup, Telemetry, And Documentation Sync

**Depends on**: Phases 2, 3, 4, 5

**Parallelization notes**: final cleanup phase; should land after the queue-specific strategies are stable.

- [x] Remove stale shared-prompt assumptions from `docs/annotation-queues.md`, `docs/reliability.md`, and `docs/ai-generation-features.md`.
- [x] Update or add tests that assert queue-specific prompts stay token-bounded and do not accidentally include unnecessary global trace metadata.
- [x] Review `run-system-queue-flagger.test.ts` for overlap and restructure fixtures/helpers so later queue-specific tuning remains maintainable.
- [x] Document any accepted dependency-specific constraints or fallback behavior that future agents must preserve.

**Exit gate**:

- system queue flagger docs reflect the new queue-specific architecture, stale shared-summary assumptions are removed, and the tests protect the intended low-token routing design.
