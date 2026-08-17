# Signal promotion — evidence-gated auto-discovery

> **Documentation** — durable homes after stabilization: `dev-docs/signals.md` (the § Denoising section becomes the authoritative promotion model), `dev-docs/notifications.md` (the `signal.discovered` trigger moves), `dev-docs/agent-dispatch.md` (the `signal.discovered` trigger gate). Related current docs: `dev-docs/flaggers.md`, `dev-docs/scores.md`, `dev-docs/monitors.md`.
>
> **Origin** — customer complaints that auto-discovered signals are too noisy: too many single-occurrence signals, and too many false positives. Both are notified and agent-dispatched the moment they are created.
>
> **Prior art in the repo** — `dev-docs/signals.md` § Denoising already describes this feature as the unbuilt "stronger buffered/provisional workflow" (persist candidates immediately, keep them hidden until promotion rules pass, promote on accumulated evidence / annotation evidence / explicit user action, keep the core signal entity shape unchanged). This spec is that design, made precise. It also honors that section's prohibition: **do not bring back the v1 merge/merged-state system.**
>
> **Status** — design settled; **PR1 built** (promotion computed and observed) and **PR2 built** (the gate enforced: candidates invisible everywhere, announcements moved to `SignalPromoted`, escalation gated, `isSignalNew` re-anchored). PR3 pending. Decisions in §5 cover the volume-scaled threshold and its constants (D3b, D3c), uniform promotion with no bypasses (D6), placeholder-then-promote naming (D2), the full `promoted_at = created_at` backfill (D13), straight cutover with the constants as the kill switch (D14), and default-deny at the repository (D15). PR2 dropped the re-evaluation pass D16 rode on and extended D13's backfill to the enforcement boundary instead — see P2-1 in §8 for why, and treat that as the current reading of D16. What remains open (§6) belongs to PR3: the consolidation and expiry parameters, validating the naming change, and tuning the constants against live data. Plan and PR split in §7.

## Contents

1. [Ground truth: how auto-discovery works today](#1-ground-truth-how-auto-discovery-works-today)
2. [Diagnosis: where the noise comes from](#2-diagnosis-where-the-noise-comes-from)
3. [The model: candidates and promotion](#3-the-model-candidates-and-promotion)
4. [Specification](#4-specification)
5. [Decisions](#5-decisions)
6. [Open questions](#6-open-questions)
7. [Plan](#7-plan)
8. [Tasklist](#8-tasklist)

---

## 1. Ground truth: how auto-discovery works today

**Annotation.** 14 flagger strategies (`packages/domain/flaggers/src/flagger-strategies/types.ts`) are provisioned per project, enabled by default (`provision-flaggers.ts`, `FLAGGER_DEFAULT_ENABLED = true`). A match writes one canonical annotation score per `(project, session, flaggerSlug, contentHash)` with `sourceType: "annotation"`, `sourceId: "SYSTEM"`, `passed: false`, and feedback text (`upsert-flagger-annotation-score.ts`). Human annotations write the same `sourceType` with a real `sourceId`.

**Routing.** `discoverSignalUseCase` checks eligibility (`check-eligibility.ts`: non-draft, non-errored, unowned, non-empty feedback, and `passed = false` for annotations) and starts either `assignScoreToKnownSignalWorkflow` (an explicitly-selected or evaluation-linked signal) or `signalDiscoveryWorkflow`.

**Matching.** `assignOrCreateSignalUseCase`:

1. takes the feedback-hash Redis lock (`SIGNAL_DISCOVERY_FEEDBACK_LOCK_KEY`),
2. `SignalRepository.hybridSearch` — `0.75 · cosine(centroid_embedding)` + `0.25 · ts_rank_cd(search_document)`, admitting candidates on fused `≥ 0.8` **or** vector-only `≥ 0.75`,
3. Voyage rerank over `name + description` of the top 25, accepting `relevanceScore ≥ 0.3`,
4. retries the whole retrieval with raw (unenriched) feedback when the enriched pass finds nothing,
5. on no match: takes the project lock, re-checks, and creates.

**Creation.** `createSignalFromScoreUseCase` generates `name` + `description` with one LLM call from the **single** initial occurrence, generates the org-unique slug, seeds the centroid from that one embedding, writes the row (`origin: "system"`, `priority: null`), claims the score, and emits `SignalCreated`.

**Fan-out.** `apps/workers/src/workers/domain-events.ts:191` turns `SignalCreated` into:

- `notifications:request-signal-discovered-notifications` → one `signal.discovered` notification per **every member of the organization** (`resolve-recipients.ts` — per-project and per-kind opt-outs are declared but "ignored in V1"),
- `agent-dispatch:request` with trigger `signal.discovered` → can open a Cursor PR.

**Lifecycle.** States are derived as a set (`deriveSignalLifecycleStates`): `new` (`createdAt` within `NEW_SIGNAL_AGE_DAYS = 7`), `escalating` (open signal-sourced incident), `regressed`, `resolved`, `ignored`, else `ongoing`. There is **no evidence gate anywhere**: one unmatched annotation becomes a fully public, notified, dispatchable signal.

## 2. Diagnosis: where the noise comes from

Four distinct mechanisms. They do not share a fix, and only the first three are what the customer perceives.

1. **Flagger false positives.** 14 LLM annotators over every sampled session. A hallucinated finding is, by construction, semantically unlike anything else in the project, so it can never match an existing signal and always creates a new one. False positives do not recur as a cluster.
2. **Cluster fragmentation, self-reinforcing.** A new signal's centroid is a single point, and its `name`/`description` are generated from a single occurrence, so they are over-specific. That degrades both the lexical channel (`search_document` is a generated column over name + description) and the rerank document for the *next* similar annotation, which then also fails to match and spawns its own singleton. Singletons beget singletons. **This is a matching defect, and an evidence gate hides it rather than fixing it** — five singletons that are really one issue each stay below any threshold forever. Candidate consolidation (§4.4) is what repairs that, which is why it is scoped into this effort (PR3) rather than left as someday-work.
3. **Genuinely rare real events.** Real, but not worth announcing at occurrence one.
4. **Fan-out amplification.** Every discovered signal notifies every org member and may dispatch an agent. One false positive in a 12-person org is 12 notifications plus a PR.

### 2.1 Field evidence

Measured on the `claude-code` project (Latitude's own Claude Code telemetry, 264 sessions, 30 signals, 2026-05-13 → 2026-08-11) via `listSignals`. One project only, and `occurrences` there counts scores in the window rather than distinct sessions, so treat the shape as indicative and re-measure org-wide to validate the threshold (Q1).

- **63% of signals (19/30) have exactly one occurrence.** 70% have ≤ 2, 77% have ≤ 3. The long tail is six signals carrying 28 to 309 occurrences.
- **At least five singletons are explicit false positives**, three of them literally *about* flagger false positives: "False positive jailbreaking flag on legitimate technical requests", "Debugging traces incorrectly flagged as jailbreak attempts", "Laziness flagger produces false positives". The annotator wrote "this is a false positive" and discovery created a signal out of it.
- **Two singletons are naming-generation failures.** One is named `description`; another is named "Provide issue name and description" with the description "I need to see more occurrences to identify a shared failure pattern across multiple instances. Only one occurrence was provided". The model refused the task because summarizing a cluster from a single member is not a well-posed request. This is direct evidence against generating names at creation (D2), independent of cost.
- **Signals that are real accumulate their second occurrence fast**: 10 minutes, 43 minutes, 46 minutes, 1.5 hours, 21 hours for the five signals that reached 2–4 occurrences. A promotion window measured in days is generous; the burst path does not need a long one.
- **Fragmentation is visible at promoted scale, not just among candidates.** "Repeated identical tool invocations" (144), "Repeated identical tool invocations" again under a different slug (31), and "Duplicate identical tool invocations" (54) are three separate signals for one problem. Candidate consolidation (§4.4) cannot fix these — all three would be promoted, and promoted-to-promoted merging stays prohibited. Only better matching (Q7) fixes that class.

Two findings that change what "fix the noise" means:

- **The severity filter shipped in #4362 is inert for discovered signals.** Discovery leaves `priority = null` (the automatic rating was built and deliberately removed — `dev-docs/signals.md:165`), and a notification payload with no severity is admitted by every threshold (`:167`). A customer's minimum-severity setting does nothing about discovery noise, so this complaint survives that change.
- **Agent dispatch on `signal.discovered` is the most expensive symptom.** Un-evidenced false positives can open pull requests. It is also the cheapest thing to gate.

## 3. The model: candidates and promotion

A discovered signal is created exactly as it is today, but **unpromoted**. An unpromoted signal is a **candidate**: it accumulates occurrences, participates in matching, and is invisible to users and to every automation. When its evidence crosses the promotion gate it is **promoted** once, irreversibly, and only then does it exist as far as the product is concerned.

```text
  flagger / human annotation
     └─ score (passed = false, feedback)
        └─ discovery: hybridSearch + rerank
             ├─ match  → assign to signal (promoted or candidate)  → +1 occurrence
             │            └─ candidate: re-evaluate the promotion gate
             │                 └─ crossed → PROMOTE (promoted_at set, SignalPromoted emitted)
             │                                └─ notifications + agent dispatch + escalation start here
             └─ no match → create CANDIDATE (promoted_at NULL, invisible)
                             ├─ consolidation merges near-duplicate candidates (looser threshold)
                             └─ expiry sweeps candidates that stop accumulating
```

Three properties define it:

- **Promotion is a one-way latch.** `promoted_at` is set once and never cleared. A promoted signal that goes quiet is handled by the existing resolve / ignore / mute lifecycle, not by demotion. Demotion would mean a signal can silently vanish after a user has triaged, assigned, or linked it, and it would let a signal notify twice.
- **Candidates are not a user-facing concept.** They have no UI, no tab, no badge, no API representation. This is what makes consolidation safe: merging two candidates destroys no user-visible identity, so it needs no "merged" state and does not reintroduce the v1 merge system.
- **The signal entity shape is unchanged.** One nullable timestamp column, no new entity, no new table, no change to "membership is `scores.signal_id`".

## 4. Specification

### 4.1 Storage and state

- `signals.promoted_at` — nullable `tzTimestamp`. `NULL` = candidate, non-null = promoted. Set exactly once.
- **No new lifecycle state.** `SIGNAL_STATES` and `deriveSignalLifecycleStates` are untouched: a candidate is never rendered, so it needs no state to render. `promoted_at` is a read-side filter, not a lifecycle axis.
- **`origin: "user"` signals are created promoted** (`promoted_at = createdAt`). Users must never lose sight of a signal they built. Same for any signal created through the API/MCP `createSignal` operation.
- Index: extend or add alongside `signals_project_lifecycle_idx` so the default list can filter `promoted_at IS NOT NULL` without a scan.

### 4.2 The promotion gate

**Counting unit: distinct sessions.** Occurrence *scores* are the wrong unit — one long session can trip the same flagger many times, and one trace can carry several annotations. Evidence is the number of distinct sessions among the signal's non-draft scores. A score with no `session_id` counts as its own session, keyed by `trace_id`, and failing that by score id, so annotations from non-session instrumentation still count exactly once.

**Predicate.** `distinctSessions ≥ threshold(projectVolume)` within `PROMOTION_WINDOW`, where

```text
threshold(sessionsInWindow) = clamp(
  PROMOTION_MIN_SESSIONS,                          // absolute floor
  ceil(PROMOTION_RATE_FLOOR × sessionsInWindow),   // volume-relative term
  PROMOTION_MAX_SESSIONS                           // cap
)
```

**A flat threshold is wrong in both directions, for opposite reasons.** In a project doing thousands of sessions a day, two independent false positives of the same kind inside one window stop being a coincidence, so a flat `2` promotes noise that repeated only by chance. In a project doing a few dozen sessions a month, a genuinely chronic problem may never put two occurrences inside a short window, so a flat `2` buries a true positive. Only a volume-aware threshold can be right at both ends, which is why the gate is a function of project volume from day one even though its constants are provisional (§6, Q1).

**Why the cap exists.** Uncapped, 0.05% of a 3M-session month is 1,500 affected sessions, and of a 30M-session month, 15,000. A threshold that high does not make discovery stricter for a large customer, it **switches discovery off** for them: essentially no cluster ever reaches it, so nothing is ever announced and (once expiry lands) the clusters are eventually swept instead. The cap is what keeps the feature functional at the top of the volume range, and that is the whole of the argument.

*(An earlier draft also claimed the cap was needed to bound the row population that discovery's un-indexed cosine scan walks. That reasoning was wrong and is recorded here so it does not get re-derived: the gate does not change how many `signals` rows exist — every unpromoted signal is a row that would have existed as a promoted signal anyway. If anything the relationship runs the other way, since expiry (§4.5) only ever sweeps unpromoted rows, so a higher threshold means a **smaller** long-run corpus, not a larger one.)*

**Saturation, stated plainly.** With `MIN = 2`, `RATE_FLOOR = 0.05%`, `MAX = 15`, the floor binds up to 4,000 sessions/30d (~133/day) and the cap binds from 28,001 (~930/day). The volume-relative term therefore only does work across a 7.5× band; above ~1,000 sessions/day every project sits at 15. That is an accepted simplification, not an oversight: the alternative that keeps adapting at every scale without a hard cap is a **sublinear** rate (`ceil(k·√sessions)`, calibrated to the same 15 at 30k sessions/30d, which asks ~150 at 3M rather than 1,500). Revisit with the sublinear form if the flat top proves wrong for a whale; the constants and the curve both live behind one pure helper so swapping them is local.

The **window** is deliberately long (30 days rather than 7) so that low-traffic projects clear the floor at all; the field evidence says real signals accumulate their second occurrence within a day, so a long window costs almost nothing in latency and buys the low-volume regime.

**Project volume comes from a lazily-populated cache, never from ClickHouse inside the transaction.** Session counts live in ClickHouse; the promotion write runs inside a Postgres transaction on the score-assignment hot path, so an analytics query held open across it would add latency and a cross-store hazard to every annotation. `resolveProjectSessionVolumeUseCase` reads `org:${organizationId}:projects:${projectId}:session-volume` and, on a miss, computes it once via `SessionRepository.countByProjectId` and writes it back under a TTL — the same lazy shape as `getSessionCohortSummaryUseCase`. No periodic job: volume is only ever needed for an unpromoted signal, and a TTL'd read-through is cheap enough at that rate to be the whole mechanism. A miss or a ClickHouse failure degrades to `PROMOTION_MIN_SESSIONS` (the floor), so a cold cache can only make promotion *easier*, never hide a signal.

**Decision order.** Split by what each step is allowed to touch, not by cost:

1. **Already promoted → stop**, on an unlocked `findById`, before anything else runs.
2. **Resolve volume → compute threshold** (Redis, ClickHouse on miss), outside the transaction.
3. Inside the transaction and per-signal lock: **re-check the latch, count distinct sessions, compare, write.**

Step 1 is load-bearing. An unpromoted signal holds at most `PROMOTION_MAX_SESSIONS` sessions by construction, so counting it is trivial; a promoted signal can hold hundreds of thousands of scores, and `scores_signal_lookup_idx` does not cover `session_id`, so counting one would mean a heap fetch per row on the ingestion hot path. Getting *that* wrong turns a cheap check into a p99 regression on every annotation for the busiest signals.

**Why the count does not gate volume resolution.** Counting first would spare the cached volume read for a signal that cannot promote yet — a one-session signal receiving a second score from the same session, say. It is rejected because the count that decides promotion has to include the score being claimed in this transaction, so the only authoritative count is the locked one, and volume cannot be resolved from inside the transaction. A pre-count outside the lock would have to guess whether the incoming score's session is new, and a pre-count that guesses low would defer a legitimate promotion to the next occurrence. What is left is one cached read per assignment to an unpromoted signal, on a path that already takes a distributed lock and writes several Postgres rows; the expensive part (the ClickHouse scan) happens once per TTL per project, not per assignment.

**Where it runs.** Inside `assignScoreToSignalUseCase`. The volume resolution (Redis + ClickHouse) happens *before* the transaction, gated on an unlocked `findById` pre-read that says the signal is unpromoted; the count, the comparison, and the `promoted_at` write happen inside the existing transaction and per-signal lock (`SIGNAL_UPDATE_LOCK_KEY`) that already serializes centroid updates and the regression claim, re-checking `promoted_at` under the lock. Promotion is a one-way latch, so a stale pre-read can only err in the harmless direction. Same optimistic-pre-read-then-authoritative-recheck shape as `loadEligibleScoreOrCurrentOwner` in the same file, and the same "reified at write time" property as `isRegression`.

**Effect.** Set `promoted_at`, emit `SignalPromoted { organizationId, projectId, signalId, promotedAt, triggerScoreId }`.

**Consolidation counts too.** When candidates merge (§4.4), the surviving candidate's evidence is re-evaluated against the same predicate, so a merge can promote immediately.

**No bypasses of any kind.** Every signal promotes on the same conditions. No flagger slug is special-cased, no human annotation short-circuits the count, and no severity, priority, or model rating is consulted. The accepted consequence, stated so nobody discovers it later: in a project above ~1,000 sessions/day a `pii-leakage`, `jailbreaking`, or `nsfw` finding needs 15 affected sessions before it is announced. A slug-keyed exception was drafted and rejected — per-flagger behavior in the promotion rule makes the gate impossible to explain and impossible to tune, and every slug added to such a list is a new special case forever. If safety findings need to reach a user faster, the fix belongs in the flagger or in notification routing, not in a carve-out here.

### 4.3 What is gated on `promoted_at`

Everything user-facing or automated. A candidate must be indistinguishable from a signal that does not exist.

**Filter at the repository, default-deny.** The exclusion belongs in `SignalRepository`'s read methods next to the existing `isNull(deletedAt)` predicates, not in each of the use-cases below. Twelve call sites that must each remember to filter is twelve chances to leak a candidate, and the next read path added after this ships would leak by default. Read methods therefore exclude candidates unless explicitly asked (`includeUnpromoted: true`), and the write/discovery paths — `hybridSearch`, `findByIdForUpdate`, the consolidation search — pass that opt-in. The port docs must state which side of the line each method sits on, because the asymmetry looks like a bug to anyone who finds only half of it.

| Surface | Behavior |
| --- | --- |
| `SignalCreated` fan-out | Both consumers (`request-signal-discovered-notifications`, `agent-dispatch:request`) move off `SignalCreated` and onto `SignalPromoted`. `SignalCreated` keeps being emitted as an audit fact with no consumers. |
| `signal.discovered` notification | **The same notification kind, fired later.** No new kind, no new `NOTIFICATION_KIND_META` entry, no new email or in-app template, no new project gate, no user-visible rename — a recipient sees exactly the notification they see today, just only for signals that earned it. The one payload change is that `discoveredAt` carries `promoted_at` rather than `created_at`, so the notification does not announce a signal as discovered three weeks ago. |
| Agent dispatch (`signal.discovered` trigger) | **The same trigger name, fired later.** Existing per-project dispatch configs keep working untouched; nobody reconfigures anything. The existing user-origin skip stays. |
| Escalation (`check-signal-escalation`, `sweep-escalating-signals`) | Skips candidates entirely — no incidents, no `signal.escalating`. |
| `isSignalNew` | Anchors on `promoted_at`, not `createdAt`. A candidate created on day 0 and promoted on day 20 is new *to the user* on day 20. Side effect: a promoted signal arrives with real occurrence history, so escalation baselines are warm instead of cold-started. |
| Signals list + analytics (`list-signals`) | Candidates excluded from items, from every count in `SignalListAnalyticsCounts`, and from `seenOccurrences` / the histogram. |
| Signal detail (web + `getSignal`) | A candidate id resolves as not found, exactly like a soft-deleted signal. |
| Org-wide search / command palette (`searchOrgWide`) | Candidates excluded (it already excludes resolved/ignored). |
| Related signals (`get-related-signals`, `findSimilarByCentroid` read path) | Candidates excluded from the Related list. The **discovery** use of `findSimilarByCentroid` and `hybridSearch` must keep including them — that is how evidence accumulates. |
| Session / trace signal reads (`list-session-signals`, `listSessionSignals`) | Candidates excluded. |
| Public API, MCP, SDK, CLI, exports (`build-signals-export`), agent toolsets | Candidates excluded from every list, get, and export. |
| Triage (assign, prioritize, resolve, ignore, mute, delete) | Not reachable: no candidate is addressable from any surface. |
| `monitorSignal` (track it with an evaluation) | Not reachable for the same reason. |

The single place candidates stay visible is discovery itself: `hybridSearch` and the consolidation pass. That asymmetry is the whole design.

### 4.4 Candidate consolidation

Fragmentation (§2.2) means the same underlying problem can sit in five candidates that each never cross the gate. Consolidation is what turns hidden fragments into one promotable signal, and without it the gate is pure suppression.

- **Scope.** Candidate-to-candidate only. A candidate may never absorb a promoted signal, and two promoted signals are never auto-merged (that is the prohibited v1 merge system).
- **Threshold.** Deliberately **looser** than the live-match threshold. Merging two low-evidence candidates is cheap and invisible; merging into a signal with user-visible history is not. The exact value is open (§6, Q2).
- **Mechanism.** Pick a survivor, reassign the losers' scores (`scores.signal_id`), fold the losers' centroids into the survivor's running weighted sum, hard-delete or soft-delete the loser rows, re-evaluate the survivor's promotion gate. No "merged" state, no redirect, no tombstone that has to be rendered — nothing pointed at a candidate.
- **Survivor choice.** The candidate with the most evidence, tie-broken by oldest `createdAt`, so identity is stable and the surviving centroid is the best-supported one.
- **Name and description.** The survivor regenerates them from its merged occurrence set through the existing throttled `signals:refresh` path, so a merged candidate stops carrying a title written from one unrepresentative occurrence.
- **Trigger.** On-write versus periodic sweep is open (§6, Q2).

### 4.5 Candidate expiry

Discovery already accumulates rows forever: today every discovered signal is a permanent `signals` row carrying a 2048-dim `centroid_embedding` that `hybridSearch` scans exactly, with no ANN index by design (the schema comment flags ~10k rows per project as the revisit point). The gate does not make that worse — the same rows would exist either way — but it does make a fix *possible* for the first time, because an unpromoted signal that never accumulated evidence is provably nothing anyone has seen, so it can be dropped without a user noticing. Expiry is therefore a net reduction below today's baseline, not a remedy for damage the gate does.

- Soft-delete candidates with no new score for `CANDIDATE_EXPIRY_WINDOW` (open — §6, Q3). Promoted signals are never swept.
- **Expired candidates keep their scores attached.** `signal_id` is not nulled: `check-eligibility` rejects scores that already carry a `signal_id`, so leaving them attached is what stops an expiry sweep from feeding the same annotations back into discovery forever. A soft-deleted signal is already excluded from `hybridSearch` and every read, so the evidence simply stops existing. If the same problem recurs later it starts a fresh candidate, which is correct and self-correcting.
- The sweep runs as a scheduled worker task, in the same family as `ESCALATION_SWEEPER_KEY`.

### 4.6 Candidate naming

A candidate's `name` and `description` are **not** LLM-generated. Generating a cluster summary from a single member is not a well-posed task, and the field evidence shows the model saying so in production (§2.1). Instead:

- **At creation**: `name` is the truncated first sentence of the initial occurrence's feedback, `description` is the feedback itself. Deterministic, no model call.
- **While a candidate**: both are maintained without a model call as occurrences accumulate.
- **At promotion**: `generateSignalDetailsUseCase` runs once over the promoted cluster's occurrences. It must be called with `previousName`/`previousDescription` as `null` — passing a placeholder as the stabilization baseline would anchor the summary to one occurrence's phrasing, which is the exact failure this section removes.

**What this does and does not touch in matching.** The centroid is built purely from **score feedback embeddings** (`embedScoreFeedbackUseCase` embeds `score.feedback`; `updateSignalCentroid` folds that vector in), so clustering geometry never sees a name or description. The vector channel — 75% of the fused hybrid score, and the whole of the vector-only `≥ 0.75` admission path — is therefore unaffected. Two channels do change: the lexical 25% (`search_document` is a generated tsvector over name + description) and the rerank document (`buildRerankDocument` = name + description), which is the final gate at `relevanceScore ≥ 0.3`.

Both changes are expected to be **improvements**, because incoming discovery queries are feedback text: comparing feedback against feedback is a fairer lexical and rerank match than comparing feedback against a generalized title. "Expected" is not "verified" — validate offline by replaying historical annotation→signal assignments with the rerank document swapped for feedback text and comparing match decisions before shipping.

Two things that are *not* affected: `slug` is a JIRA-style `PRE-XXXX` code with no relationship to the name (`slug.ts`), so a placeholder cannot burn a permanent identifier; and `findSimilarByCentroid` (Related signals, consolidation) is centroid-only.

### 4.7 Observability

Discovery is now a funnel, and tuning the threshold requires seeing it. Per project: candidates created, candidates promoted, promotion latency (`promoted_at − created_at`), live candidate population, consolidation merges, expiries. Enough to answer "how much did we suppress, and was any of it real" without a ClickHouse ad-hoc query each time.

**A minimal slice of this ships with the gate itself, not later.** Shipping a suppression mechanism blind is how a bug where promotion never fires goes unnoticed for weeks while customers quietly stop discovering anything. The gate's PR carries at least: a span/metric on candidate creation, one on promotion carrying the threshold that was applied and the volume it came from, and a counter for cache-miss-degraded-to-floor. The richer per-project funnel and the population gauge can wait for the expiry work.

## 5. Decisions

- **D1 — Evidence gate as `signals.promoted_at`, not a new entity or a new lifecycle state.** Keeps membership (`scores.signal_id`), the centroid machinery, and the derived-state set untouched; matches `dev-docs/signals.md` § Denoising ("keep the core signal entity shape unchanged").
- **D2 — Candidates carry a deterministic placeholder name and description; the LLM summary is generated once, at promotion** (§4.6). Reframed from a cost optimization to a matching-quality fix: summarizing a cluster from one member is not a well-posed task, it demonstrably fails in production, and the resulting bad summary degrades the two matching channels that decide whether the next occurrence joins the cluster. Clustering geometry is unaffected because the centroid is built from feedback embeddings only.
- **D3 — Promotion counts distinct sessions**, not scores and not traces. Falls back to `trace_id`, then score id, when `session_id` is absent.
- **D3b — The threshold is a function of project volume, not a constant** (§4.2): an absolute floor, a volume-relative term, and a cap, over a long (30-day) window. A flat threshold is wrong in opposite directions at high and low traffic. Volume comes from a **lazily-populated TTL cache** (read-through on miss, no periodic job), and any failure degrades to the floor, so the gate can never suppress a signal because a cache or ClickHouse was unavailable.
- **D3c — The constants are `PROMOTION_MIN_SESSIONS = 2`, `PROMOTION_RATE_FLOOR = 0.0005` (0.05% of sessions in window), `PROMOTION_MAX_SESSIONS = 15`, `PROMOTION_WINDOW = 30 days`.** The cap is kept rather than dropped for one reason: uncapped, the threshold reaches 1,500 sessions at 3M sessions/month, which does not make discovery stricter for a large customer but switches it off entirely (§4.2). All four are tunable behind one pure helper, and the shape may later become sublinear instead of linear-with-cap.
- **D4 — Promotion is a one-way latch.** No demotion, ever.
- **D5 — `origin: "user"` signals are born promoted.**
- **D16 — Explicit user intent promotes.** A signal with an active evaluation counts as promoted: somebody deliberately tracked it, so it is real regardless of accumulated evidence. Generalizes D5.

  It was going to be a clause in PR2's re-evaluation pass rather than a write inside `monitorSignal`, to avoid adding a `promoteSignal` method to `EvaluationSignalRepository` — the deliberately tiny read-only view that exists so `@domain/evaluations` need not depend on `@domain/signals` — plus its adapter, its fake, and a call site.

  **As built, D16 needs no code at all.** PR2 dropped the re-evaluation pass for a second full backfill (P2-1), which promotes every signal that had an evaluation along with everything else. Going forward the case cannot arise: tracking a signal means reaching it, and a candidate is not reachable from any surface, so no unpromoted signal can acquire an evaluation. If a future path ever lets one, this becomes a real write and the `EvaluationSignalRepository` cost above comes back.
- **D6 — No bypasses. Promotion conditions are uniform for every signal.** No per-flagger special cases, no human-annotation short-circuit, no severity input (§4.2). A slug-keyed safety bypass was drafted and rejected: per-flagger behavior in the promotion rule cannot be explained or tuned, and the list only ever grows. Accepted consequence: above ~1,000 sessions/day a safety finding needs 15 affected sessions before it is announced; if that is too slow, the fix belongs in the flagger or in notification routing.
- **D7 — Candidates are fully invisible.** No UI surface, no tab, no API representation, no "emerging" list. For the product, a candidate does not exist (§4.3).
- **D8 — Nothing user-facing is added; only the trigger moves.** The `signal.discovered` notification kind and the `signal.discovered` dispatch trigger stay exactly as they are and simply fire at promotion instead of at row creation. `SignalPromoted` is an **internal domain event**, not a notification kind and not a dispatch trigger — it exists only to carry that trigger. `SignalCreated` keeps firing at row creation as an audit fact with no consumers.

  `SignalPromoted` is emitted from **PR1** with an inert handler registered (`EventHandlerMap` is exhaustive over `EventPayloads`, and an unregistered name dead-letters on `UnhandledEventError`), so the outbox carries a durable promotion record during the shadow window; PR2 replaces that inert handler with the two publishes taken off `SignalCreated`.

  The alternative was to add no event at all and re-time `SignalCreated` to fire at promotion. Rejected on two counts. First, a domain event names a fact: an event called `SignalCreated` that arrives days after the row was created misleads every future reader and every future consumer, and this codebase already distinguishes `SignalRegressed`, `SignalEscalated`, and `SignalAssigneeChanged` for exactly that reason. Second, it does not even save a payload change — the notification renders `discoveredAt`, so a re-timed `SignalCreated` would have to either carry `promoted_at` in a field named `createdAt` (a worse lie) or gain a field anyway. Adding one internal event is the smaller edit.
- **D9 — `isSignalNew` anchors on `promoted_at`.**
- **D10 — Escalation never runs for candidates.**
- **D11 — Candidate consolidation is in scope from the start**, candidate-to-candidate only, on a looser threshold than live matching, implemented as a real merge with no "merged" state (the v1 merge system stays retired).
- **D12 — Candidate expiry is in scope**, as a soft-delete sweep that leaves expired scores attached to the deleted candidate so they are never rediscovered.
- **D13 — Migration backfills `promoted_at = created_at` for every existing signal.** The gate applies to newly discovered signals only. Retroactively hiding signals a customer has already seen (and may have triaged, referenced, or linked) is a worse failure than leaving existing noise in place, and it would make the migration unreviewable. Consequence to communicate: a complaining customer's current list does not get cleaner on deploy, only stops getting worse. Cleaning up the existing backlog is a separate, manual bulk resolve/ignore.
- **D14 — Straight cutover, no feature flag.** A flag would put a branch on every read path in §4.3 and leave twelve places to un-branch later. It is also unnecessary: the backfill (D13) means existing signals are untouched, so the blast radius is "newly discovered signals are not announced", and **the constants are the kill switch** — `PROMOTION_MIN_SESSIONS = 1` with `PROMOTION_RATE_FLOOR = 0` reproduces today's behavior exactly, as a config change rather than a revert. Paired with the day-one telemetry in §4.7, that is a faster and cleaner safety valve than a flag.

  The claim only holds because the gate is evaluated at creation as well as on assignment (added in PR2, after review pointed out that it was false as first built). A creating score is a single session, and promotion was otherwise only ever evaluated when a *second* score arrived, so a one-session signal stayed invisible forever and the floor was effectively 2 whatever it was configured to be. That was a hole in D3b's contract, not only in this decision's kill switch: with `MIN = 1` a low-traffic project's first occurrence is supposed to promote immediately, which is the "buries a true positive" case the volume-scaled threshold exists to avoid. The creation path tests `PROMOTION_MIN_SESSIONS` before resolving volume, so the extra Redis/ClickHouse read never happens in a configuration that could not use it.
- **D15 — Candidate exclusion is enforced in the repository, default-deny**, with an explicit `includeUnpromoted` opt-in for the discovery and consolidation paths (§4.3).

## 6. Open questions

- **Q1 — Validating the constants after the fact.** Shape and values are settled (D3b, D3c); what is unmeasured is whether they are *right*. Two gaps: the distribution of distinct sessions per signal **org-wide** (the sample in §2.1 is one low-traffic project; the appendix has the SQL, and the ClickHouse Cloud MCP has no query grant on the production service so someone with access must run it), and the **false-positive repeat rate at high volume**, which is exactly what `PROMOTION_RATE_FLOOR` guards against and which nothing in the current data speaks to. Ship instrumented (§4.7), then tune. Also open: project-configurable from day one (`dev-docs/signals.md:348` wants the visibility threshold configurable) or tuned constants with configurability deferred?
- **Q2 — Consolidation trigger and threshold.** On every candidate creation (immediate, adds latency and cost to the create path) or a periodic per-project sweep (cheaper, delays promotion)? What similarity threshold, how far below the live-match gate, and is there a cap on how many candidates one pass may merge?
- **Q3 — Expiry window.** How long a candidate may sit idle before it is swept, and whether that interacts badly with a legitimately slow-burning problem (which is the same tension as Q1's slow-burn path).
- **Q4 — Validating the naming change (D2).** The mechanism is decided (§4.6); what is unverified is the claim that feedback text is a *better* lexical and rerank document than a generated title. Needs the offline replay described in §4.6 before PR4 ships. If the replay shows a regression, the fallback is to generate the summary at creation for the lexical channel's sake and accept the known-bad input.
- **Q7 — Should the matching defect be fixed in this effort?** The gate hides fragmentation, consolidation compensates for it among candidates, and §2.1 shows it also happens between already-promoted signals, where neither mechanism can help (promoted-to-promoted merging stays prohibited). The root fix is to match against **member score embeddings** — k-NN over the annotation embeddings, vote by signal — instead of a single centroid plus a lossy LLM summary. It would cut both noise and false-negative splitting and make Q4 free. Cost note: score embeddings are currently computed per discovery run and **thrown away** (`embed-score-feedback.ts` returns them to the workflow; nothing persists them), so this needs a store — a pgvector column on `scores` or a side table — which is the bulk of the work. Separable from PR1–PR4, and arguably the highest-value follow-up.

## 7. Plan

**Three PRs.** Two rules shape the split. Each PR must deliver value on its own and leave no liability for a later one. And **the UI must follow the logic**: a signal that never announced itself but still sits in the list is an incoherent state, so visibility and consequences change in the same PR.

- **PR1 — Promotion computed and observed.** `promoted_at`, the volume-scaled threshold, the volume cache, the promotion decision inside the assignment transaction, `SignalPromoted` emitted with an inert handler, and the shadow readout. **Nothing else changes**: signals still notify, dispatch, escalate, and appear exactly as today.

  Standalone value: the four threshold constants are unvalidated (the only reachable data is one low-traffic project), so PR1 runs the real gate against live traffic and records what it *would* have suppressed. PR2 then enforces tuned numbers instead of guesses. Precedent: taxonomy Phase 4 shadow mode (#4123), retired once the experiment concluded (#4388).

  **Time-boxed**: about a week of data, one review of the readout, then PR2. Shadow modes without an exit criterion never get retired.

- **PR2 — Enforcement.** Unpromoted signals disappear from every surface (§4.3, default-deny at the repository), and every consequence moves to promotion: the `signal.discovered` notification and the agent dispatch shift from `SignalCreated` to `SignalPromoted`, escalation stops running for unpromoted signals, `isSignalNew` anchors on `promoted_at`, and the `promoted_at` index lands with the queries that need it. One coherent change: the gate becomes real, in the UI and in the logic at once.

  **Before hiding anything, promote what already announced itself.** The plan here was a one-time re-evaluation pass with the final constants, on the grounds that a tuned constant leaves qualifying signals unstamped. What shipped instead is a second `promoted_at = created_at` backfill: the shadow cohort has already been announced and dispatched, so re-scoring it can only *retract* signals people have seen, which is what D13 refused. P2-1 in §8 has the full argument, including the duplicate-dispatch hazard it closes.

  The public surface needed no regeneration — `promoted_at` is in no response and no route metadata changed (P2-8).

- **PR3 — Cluster hygiene.** Naming moves to promotion (§4.6, gated on its offline replay — Q4), consolidation merges near-duplicate unpromoted signals (§4.4), and expiry sweeps the ones that never accumulate (§4.5). One theme: the candidate pool stays clean and honest. Consolidation is what repairs the one gap PR2 knowingly opens — a real problem fragmented across several one-session signals is hidden by enforcement until its fragments merge. That gap is bounded (in the §2.1 sample, ~2 real problems against ~17 correctly-suppressed ones), which is why it is acceptable to ship enforcement first rather than holding it back.

Q7 (k-NN over member score embeddings) stays out: it is the root fix for the fragmentation PR3 works around, it needs a new embedding store, and it deserves its own spec.

## 8. Tasklist

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### PR1 — Promotion computed and observed

- [x] **P1-1**: Migration adding `signals.promoted_at` (nullable `tzTimestamp`), plus a custom-SQL backfill `promoted_at = created_at` for every existing row (D13). No index yet — it lands in PR2 with the queries that need it.
- [x] **P1-2**: `Signal` entity, PG mapper (`toDomainSignal` / `toInsertRow`, **including the upsert `set` block** — the promotion write goes through `save`, so omitting it there makes the latch silently never stick), and seeds (an `unpromoted` fixture flag plus one unpromoted fixture) carry `promotedAt`. `createSignalUseCase` sets `promotedAt = createdAt` (D5); `createSignalFromScoreUseCase` leaves it null.
- [x] **P1-3**: The four `PROMOTION_*` constants (D3c) and the cache key/TTL in `@domain/signals/constants.ts`; pure `promotionThreshold(sessionsInWindow)` in `promotion.ts`, tested at the floor, in the band, and at both clamp boundaries.
- [x] **P1-4**: `resolveProjectSessionVolumeUseCase` — read-through TTL cache over `SessionRepository.countByProjectId`, modelled on `getSessionCohortSummaryUseCase`; `CacheError` and `RepositoryError` both degrade to `null` (caller uses the floor).
- [x] **P1-5**: `ScoreRepository.countDistinctSessionsBySignalId({ projectId, signalId, since })` — port, PG implementation over `scores_signal_lookup_idx`, and fake, all honoring the D3 `session_id → trace_id → id` fallback.
- [x] **P1-6**: The promotion decision in `assignScoreToSignalUseCase` in the §4.2 order: pre-read outside the lock, volume + threshold only when unpromoted, then inside the transaction short-circuit on `promoted_at`, count, compare, stamp, and write the `SignalPromoted` outbox event.
- [x] **P1-7**: `SignalPromoted` payload in `@domain/events` plus an inert handler in `apps/workers/src/workers/domain-events.ts`, commented so it is not mistaken for dead code. `SignalCreated` keeps both consumers.
- [x] **P1-8**: Layers for the new requirements (`CacheStore`, `SessionRepository`, `ChSqlClient`) on **both** activities in `apps/workflows/src/activities/signal-discovery-activities.ts` — `assignScoreToSignal` and `assignOrCreateSignal`, since the latter calls the former.
- [x] **P1-9**: Shadow readout — span annotations (`promotion.sessions`, `promotion.threshold`, `promotion.volume`, `promotion.volumeDegraded`, `promotion.promoted`), and the SQL readout in Appendix A. No bespoke log event: this package instruments through spans (`Effect.annotateCurrentSpan`), and the taxonomy `shadowComparison` event that suggested one was retired in #4388, so following the local convention keeps the data in one place.
- [x] **P1-10**: Docs — `dev-docs/signals.md` § Denoising describes the promotion model and states that visibility and announcements are unchanged at this stage.

**Exit gate**: promotion fires on live traffic and stamps `promoted_at`; `SignalPromoted` lands in the outbox exactly once per signal and dispatches without dead-lettering; **no** notification, dispatch, escalation, or visibility behavior changes; existing signals are untouched by the migration; the readout answers "how many signals would have been suppressed, per project, at what threshold"; `pnpm typecheck`, the affected suites, and `knip` all green.

### PR2 — Enforcement

- [x] **P2-1**: ~~One-time re-evaluation pass over unpromoted signals with the final constants~~ — **replaced by a second `promoted_at = created_at` backfill**, shipped in P2-4's migration. Re-scoring the shadow cohort and hiding the non-qualifiers is the very thing D13 refused for the pre-existing backlog: those signals already notified the whole organization and already dispatched their agents, so hiding them retracts signals people have seen. It also removes a real hazard — a shadow-cohort signal promoting after enforcement re-fires agent dispatch (the notification is safe, its idempotency key is `signal.discovered:${signalId}` and the unique index is permanent; `checkGuardrails` only applies a cooldown), so a second Cursor PR could open. Promoting the lot is a superset of promoting the qualifiers, so nothing is lost but the shadow week's noise, which stays visible. Subsumes D16 and makes an escalating candidate impossible, which is what lets P2-6 be a plain early return.
- [x] **P2-2**: Default-deny in `SignalRepository` (D15) via one shared `userVisibleSignal` predicate, with an `includeUnpromoted` opt-in on `findById` and `hybridSearch`; port docs state which side each method sits on. `findByIdForUpdate` needs no opt-in — it is a write path and never filters. `findSimilarByCentroid` default-denies with no opt-in yet; its doc notes consolidation will need one, rather than shipping a dead option. **Trap found and avoided**: `countBySlug` and `existsBySlug` must NOT filter, or a candidate's slug is handed out twice and collides with `signals_unique_slug_per_org_idx`.
- [x] **P2-3**: Adapter tests per read method (`signal-repository.test.ts`) plus the inverse — write and slug paths, and `hybridSearch({ includeUnpromoted: true })`, still see the candidate. Domain-level: `list-signals` (items, counts, `seenOccurrences`, histogram key set, and `hasAnySignals: false` for an all-candidate project) and `list-session-signals`. Detail, `searchOrgWide`, Related, and the export are covered at the adapter or by construction — the first three funnel through `findById`/`findBySlug`/`findByIds`, and the export pages `listSignalsUseCase`.
- [x] **P2-4**: `signals_project_lifecycle_idx` made **partial** on `deleted_at IS NULL AND promoted_at IS NOT NULL` rather than gaining a sixth key column — every user-facing read carries both predicates, so this shrinks the index, and the paths that must see candidates use the PK or an exact vector scan. Same migration carries P2-1's backfill.
- [x] **P2-5**: Notification and dispatch publishes moved from `SignalCreated` to `SignalPromoted`, passing `discoveredAt: promotedAt`. `SignalCreated` stays registered and inert (`EventHandlerMap` is exhaustive; removing it would dead-letter rather than drop).
- [x] **P2-6**: `check-signal-escalation` reads with `includeUnpromoted` and then returns early, modelled on the existing `ignoredAt` guard. The opt-in-then-skip is deliberate: a default-deny 404 would surface as `SignalNotFoundForEscalationCheckError` on a path the hourly sweeper feeds. (`sweep-escalating-signals` needs no change: it iterates open incidents, which an unpromoted signal cannot have.)
- [x] **P2-7**: `isSignalNew` anchors on a new `signalFirstVisibleAt` helper (D9). Three places move together — `deriveSignalLifecycleStates`, `check-signal-escalation`, and the SQL duplicate of the same rule in `listTableRows`' `stateRank`, which would otherwise sort a row as one state and render it as another.
- [x] **P2-8**: **No regeneration needed.** `promotedAt` is exposed in no API response and no route metadata changed, so `openapi.json`, `mcp.json`, both SDKs and `packages/cli/reference.md` stay byte-identical (CI diffs all five). `@repo/operations` needed no edit: every signal read resolves through `findBySlug`, `findByIds`, or `listSignalsUseCase`. Accepted consequence: the `signal-agent` toolset reads the same `listSignals`, so the agentic generator cannot see candidates when deduping — correct under D7, since a candidate is not a signal the user has.
- [x] **P2-9**: Seeds carry a second, older candidate alongside PR1's; docs updated to the end-state model.

**Exit gate**: a candidate appears in no list, count, export, detail page, palette result, or API response, notifies nobody, dispatches nothing, and opens no incident; crossing the threshold announces exactly once; user-created signals are unaffected.

### PR3 — Cluster hygiene

- [ ] **P3-1**: Offline replay (Q4) comparing match decisions with the rerank document as generated summary versus as feedback text; gate the naming change on the result.
- [ ] **P3-2**: Deterministic placeholder name/description at creation, real summary generated once at promotion with `previousName`/`previousDescription` as `null` (§4.6); placeholder maintenance needs no model call.
- [ ] **P3-3**: Consolidation use-case — candidate-to-candidate similarity on the looser threshold (Q2), survivor selection (most evidence, then oldest), score reassignment, centroid fold, loser deletion, promotion re-evaluation, `signals:refresh` for the survivor.
- [ ] **P3-4**: Consolidation locking, idempotency, and trigger (Q2); guard tests that a promoted signal is never absorbed and two promoted signals are never merged.
- [ ] **P3-5**: `CANDIDATE_EXPIRY_WINDOW` (Q3) and the scheduled sweep soft-deleting unpromoted signals with no new score in the window, scores left attached (§4.5).
- [ ] **P3-6**: The per-project funnel beyond PR1's minimum: population gauge, promotion latency, merge and expiry counters (§4.7).

**Exit gate**: no LLM call on the signal-creation path and every promoted signal named from its full cluster; N fragments of one problem merge into one that announces when the union crosses the gate; the unpromoted population is bounded and the row corpus trends down.

## Appendix A — the PR1 shadow readout

Run against Postgres after PR1 has been live for a few days. The backfill (D13) makes it exact: the only `promoted_at IS NULL` rows are genuinely unpromoted signals discovered since the migration, i.e. exactly what enforcement would hide.

```sql
SELECT
  p.slug                                              AS project,
  count(*)                                            AS discovered,
  count(*) FILTER (WHERE s.promoted_at IS NULL)        AS would_be_hidden,
  round(100.0 * count(*) FILTER (WHERE s.promoted_at IS NULL) / count(*), 1) AS pct_hidden,
  round(avg(EXTRACT(EPOCH FROM (s.promoted_at - s.created_at)) / 3600)::numeric, 1) AS avg_hours_to_promote
FROM latitude.signals s
JOIN latitude.projects p ON p.id = s.project_id
WHERE s.origin = 'system'
  AND s.deleted_at IS NULL
  AND s.created_at > :migration_deployed_at
GROUP BY p.slug
ORDER BY discovered DESC;
```

Pair it with the `promotion.*` span attributes for the per-decision detail the table cannot carry: `promotion.sessions`, `promotion.threshold`, `promotion.volume`, and `promotion.volumeDegraded` on the `issues.assignScoreToSignal` span. Together they answer the question that gates PR2 — is `pct_hidden` suppressing noise or suppressing signal, and does the threshold each project resolves to look sane for its traffic.

## Appendix B — threshold measurement query (Q1)

Run against the production ClickHouse `scores` table (needs a grant the ClickHouse Cloud MCP does not currently have). Session keying mirrors D3. Complements Appendix A: this one measures history, that one measures the gate running live.

```sql
SELECT
  least(sessions, 10) AS sessions_bucket,   -- 10 = "10 or more"
  count()             AS signals,
  round(100 * count() / sum(count()) OVER (), 1) AS pct
FROM (
  SELECT
    signal_id,
    uniqExact(if(session_id != '', toString(session_id),
              if(trace_id != '', toString(trace_id), toString(id)))) AS sessions
  FROM scores
  WHERE signal_id != ''
    AND source = 'annotation'
    AND errored = false
  GROUP BY signal_id
)
GROUP BY sessions_bucket
ORDER BY sessions_bucket;
```

Second query, for the window (time from a signal's first occurrence to its second, which is what bounds `PROMOTION_WINDOW`):

```sql
SELECT
  quantiles(0.5, 0.75, 0.9, 0.99)(dateDiff('hour', first_seen, second_seen)) AS hours_to_second
FROM (
  SELECT
    signal_id,
    min(created_at) AS first_seen,
    arraySort(groupArray(created_at))[2] AS second_seen
  FROM scores
  WHERE signal_id != '' AND source = 'annotation' AND errored = false
  GROUP BY signal_id
  HAVING count() >= 2
);
```
