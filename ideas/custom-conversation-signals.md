# Custom Conversation Signals

> **Status**: Idea
> **Related documentation**: [`dev-docs/conversation-intelligence.md`](../dev-docs/conversation-intelligence.md)

## Goal

Users should be able to describe a particular support, product, or agent failure mode in natural language and have Latitude track it across all incoming conversations at scale, without sampling and without running an LLM on every session.

Examples:

- "The user wants to cancel, but the agent deflects into troubleshooting and never gives a cancellation path."
- "The assistant refuses a reasonable billing request by citing policy without offering escalation."
- "The user asks the same question multiple times because the agent keeps answering adjacent but not identical questions."

This idea extends the current **moment labels** model into a broader **signals** model. Built-in labels such as `escalation`, `abandonment`, `user_frustration`, and `clarification_loop` would become default signals, while users could define custom project-scoped signals.

## Why This Fits The Current System

The conversation-intelligence pipeline already has the right primitives:

- Sessions are segmented into semantic moments.
- Each moment has text that can be embedded.
- Built-in moment labels are matched through anchor embeddings and calibrated gates.
- The hot path is embeddings-only and deterministic.
- LLM calls are reserved for amortized calibration work, not per-session analysis.

Custom signals can follow the same basic shape: define a signal once, embed or otherwise compile its definition, and then compare it against every incoming semantic moment in the hot path.

The important constraint is that natural language should be the **authoring interface**, not necessarily the complete classifier.

## Strengths

- **User-specific failure modes**: users can track operational patterns that Latitude cannot know in advance.
- **No per-session LLM cost**: matching can remain embedding-based and deterministic in the hot path.
- **Exhaustive coverage**: every eligible moment in every incoming session can be evaluated, preserving the no-sampling product goal.
- **Clean product model**: signals remain behavioral labels, not topics, so they do not pollute taxonomy clustering.
- **Reuses existing machinery**: semantic moments, embeddings, Redis caching, calibrated gates, and generation-pinned reads all remain useful.
- **Unifies built-ins and custom definitions**: default signals become seeded signal definitions rather than a separate concept.

## Weaknesses Of A Naive Approach

A simple implementation would embed the user's natural-language signal description and compare it directly to every moment embedding. That is attractive, but too weak for the ultimate goal.

Single-description embedding works best for broad semantic similarity:

```text
"user asks for a refund but the agent refuses"
```

It is much weaker for complex failure modes involving:

- Negation: something did not happen.
- Sequence: one event happened before another.
- Repetition: the same intent or misunderstanding recurred.
- Absence of resolution: the user left without a clear answer.
- Multi-moment patterns: the failure emerges across the session, not in one message range.
- Tool or span context: the agent may have called the wrong tool, skipped a required tool, or received a failing tool result.

Example of a hard case:

```text
"The user is trying to cancel, the agent repeatedly deflects with troubleshooting steps, no clear cancellation path is offered, and the session ends unresolved."
```

An embedding can capture that this is about cancellation and deflection, but it cannot reliably prove ordering, repetition, lack of resolution, or absence of a cancellation path.

## Proposed Model

Custom signals should be first-class project-scoped signal definitions. A signal definition should be compiled into one or more matching predicates that can be evaluated cheaply for every session.

There are two useful levels.

## Moment Signals

Moment signals attach to individual semantic moments. They are closest to today's moment labels.

Examples:

- `cancellation_intent`
- `policy_refusal`
- `user_confusion`
- `agent_deflection`
- `missing_answer`

These can be implemented with embedding anchors, calibrated thresholds, and evidence ranges. The user's description can generate or refine the anchors, but matching should still use deterministic cosine gates in the hot path.

## Composite Session Signals

Composite signals detect patterns across moments, labels, topics, outcomes, and possibly tool/span metadata.

Examples:

```text
cancellation_failure = cancellation_intent AND agent_deflection AND NOT resolution
```

```text
clarification_failure = repeated(user_confusion, min_count = 2) AND NOT resolution
```

```text
bad_policy_refusal = policy_refusal AND escalation_intent AND NOT escalation_completed
```

The user still writes natural language, but Latitude compiles the description into a signal plan: one or more moment predicates plus deterministic composition logic.

This keeps the hot path exhaustive and cheap while allowing more complex failure modes than a single embedding comparison can express.

## Calibration Requirements

Calibration is the hard part.

Default moment labels work because they have curated anchors and per-project calibrated gates. Custom signals need comparable discipline, otherwise they will become either too noisy or too conservative.

A custom signal likely needs:

- A user-authored natural-language description.
- Generated positive anchors.
- Optional negative description or negative anchors.
- Optional positive and negative example sessions or moments.
- A per-project threshold derived from the project's score distribution.
- Offline judge or user review of top candidates before activation.
- An `active`, `calibrating`, `disabled`, or `needs_examples` lifecycle state.
- Versioning whenever the definition, anchors, or composition logic changes.

Rare failure modes are especially difficult. If a project has only a few true positives, score distributions alone may not provide enough evidence to set a safe gate. In those cases, the signal should remain in a calibrating or needs-examples state rather than silently using an unsafe fallback.

## No-Sampling Interpretation

The product promise should be precise:

Latitude can apply active signal definitions to **100% of incoming eligible sessions** without sampling.

However, signal calibration and quality estimation may still use sampled candidate review, offline LLM judging, or user feedback. Detection can be exhaustive; validation cannot be exhaustive without paying the full LLM cost.

This distinction preserves the existing design stance: expensive reasoning is amortized during setup, calibration, and gardening, not performed per session.

## Storage And Read Implications

Custom signals would probably require a new project-scoped definition store outside ClickHouse, plus ClickHouse rows for matched signal occurrences.

Likely concepts:

- `signal_definitions`: project-scoped signal metadata, description, lifecycle state, version, and ownership.
- `signal_anchors`: embedded positive and negative anchors for a signal version.
- `signal_thresholds`: calibrated gates per signal version and project.
- `conversation_signal_matches`: ClickHouse rows attached to session analysis generations and, when applicable, semantic moments.

Signal matches should follow the same generation-pinning discipline as current moment labels. Reads must only count matches from the current `analysis_hash` for each session, otherwise stale signal versions and superseded analysis generations will inflate rates.

## Open Questions

- Should custom signals replace `MOMENT_KINDS`, or should built-ins remain a special seeded set?
- How much of signal compilation should be visible and editable by the user?
- What is the minimum viable authoring UI: description only, description plus examples, or examples required?
- How should users provide negative examples without creating too much setup friction?
- Should composite signals be available in the first version, or should the first version only support moment-level signals?
- Can signal definitions reference taxonomy topics, or should topic conditions be added later?
- How should signal version changes affect historical matches: reprocess, fork generations, or only apply going forward?
- What quality guarantees should Latitude expose before allowing a signal to become active?

## Recommendation

It makes sense to extend moment labels into signals, but custom signals should not be treated as a single embedded description matched directly against every moment.

The stronger target is:

> Users describe failure modes in natural language. Latitude compiles that description into one or more embedding-backed semantic predicates plus deterministic composition rules, calibrates thresholds per project, then evaluates the resulting signal against every semantic moment or session without per-session LLM calls.

This keeps the current embeddings-only hot path intact while giving users a realistic path toward tracking complex, domain-specific failure modes at scale.
