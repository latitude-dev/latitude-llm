# Docs Overhaul Plan

> Rework the public docs (`docs/`, Mintlify) around a clear product funnel and the four-stage product loop, **Trace → Discover → Triage → Test & Fix**, applying the principles in [8 Rules for Better Docs](https://mattpalmer.io/posts/2025/10/8-rules-for-better-docs/). This refines the original "three axis" proposal with a concrete IA, a page-by-page disposition, a media shot-list, and a CI/agent workstream so the docs stop going stale.

## How this plan relates to the Signals spec

`specs/signals.md` (LAT-664) restructures Issues, Monitors, and Saved Searches into one pipeline: **Signal → Monitor → Alert → Incident**, with signal membership materialized at write time. It is a large change, it is not shipped yet, and it depends on the still-unbuilt sandbox-runtime spec. The current product still has Issues, automatic issue discovery, and saved-search monitors. The spec itself says the current specs stay accurate until the migration phases begin.

So this overhaul targets the **current product**, but it is written to be **forward-compatible** with Signals, so the later migration is a rename and a reframe rather than a rewrite:

- Changes that are already true today and match the spec's direction are applied **now**.
- Changes that only make sense once Signals ships are collected in **"Signals migration (phase B)"** near the end, so nothing in the live docs contradicts what is currently built.
- One naming fix is applied immediately, regardless of timing: the word **"Signal"** is reserved for the future first-class entity. We never use it to mean scores, annotations, or flagger output. The old plan and the spec used the same word for opposite things, and that collision has to go.

**Decision needed:** does this overhaul ship *before* Signals (apply the "now" items, hold phase B) or *alongside* Signals (do everything, but the docs cannot merge until the feature does, and `rule`/`script` signal types may not be in the first cut because of the sandbox dependency)? This plan assumes "before" until told otherwise.

## Why this version of the plan

The original note said "docs are terribly outdated." That was true of the *old* structure, but the recent rework already landed most of the funnel: `getting-started/introduction`, `how-to-use-latitude`, and `telemetry/start-tracing` are modern, prose-first, and agent-native. The nav already has **Search**, **Issues**, **Evaluations**, **Monitors**, and **Security & Compliance** as groups.

So this is **not a teardown**. It is: (1) close the one genuinely missing axis, **Test and Fix** (datasets, regression testing, MCP, SDKs); (2) name the **Discovery** layer that already exists but is not grouped; (3) clean up dead and orphaned pages; and (4) add the media and CI discipline that actually keeps docs from rotting again.

---

## Guiding principles (from the 8 rules)

1. **Write for humans, optimize for agents.** Prose-first; never lock critical info in screenshots; keep `llms.txt` healthy (Mintlify auto-serves `/llms.txt` and `/llms-full.txt`).
2. **Funnel.** Every top section answers *what/why, then quickstart, then next steps*. Landing page has zero marketing speak.
3. **Diátaxis.** Tag every page as Tutorial, How-to, Reference, or Explanation. Our biggest gap is **tutorials** (learn-by-building end-to-end).
4-7. **Write, build, and automate with agents and CI.** "Docs for your docs," a style config, and link and image checking on every PR.
8. **Make contribution easy and visible.** Lean on the existing `docs` and `mintlify-preview` skills; add a short CONTRIBUTING note.

---

## Cross-cutting: make the loop pervade every page

The **Trace → Discover → Triage → Test & Fix** loop is the product's mental model, so it should be the docs' mental model too, not just a nav label. Every page locates itself in the loop, and the loop vocabulary stays controlled (same four verbs everywhere, no synonyms drifting in).

What each stage means today, and where Signals will move it later:

- **Trace.** Instrument the app and send telemetry. Unchanged by Signals.
- **Discover.** Find behaviors worth caring about. Today this is two things: you explore with search, and Latitude also discovers issues automatically. Under Signals, automatic discovery goes away and "discover" becomes "explore, then deliberately define a Signal to track." See phase B.
- **Triage.** Decide what matters and route it. Today: issue priority, assignee, resolve, ignore. Under Signals this becomes signal priority and assignees, plus resolve, ignore, and mute that write to the signal's default monitor underneath.
- **Test & Fix.** Turn what you found into datasets and regression tests. Unchanged by Signals.

Concretely, the loop is enforced by a **shared page template**, not by ad-hoc prose:

- **Frontmatter** `title` and `description` that state what the page does and which loop stage it serves (descriptions already double as the answer an agent surfaces).
- **One-line "where you are"** orienting sentence at the top of every section overview: which stage this is, what came before, what comes next. Kept to a sentence so it does not bloat the page.
- **A standardized "Next step" block** at the foot of every page that points to the next loop stage (this is also the funnel's exit, per rule 2).
- **Controlled vocabulary:** Trace, Span, Session, Saved search, Issue, Monitor, Alert, Incident, Dataset, Regression test. Defined once in `concepts`, used identically everywhere, linked on first use. Reserve **Signal** for the future entity in `specs/signals.md`; do not use it for scores or annotations. The Signals migration redefines this list (drops Issue, redefines Signal, adds Occurrence). See phase B.

**Tension to manage (and the rule):** loop-framing must stay *tight*. One orienting sentence and one next-step block per page, never multi-paragraph "here is how this fits the journey" marketing. Answer-first content comes first on the page; the framing brackets it.

## Cross-cutting: exploration vs tracking

This is the single most important idea to teach, it is already true today, and it is the backbone of the Signals spec, so we establish it now.

- **Exploration** is a query-time, best-effort ranked sample. A semantic search ("user frustration") returns the most relevant traces, not every matching trace, and it carries no counts, histograms, or alerts. Saved searches bookmark these explorations.
- **Tracking** is a set you can count and alert on. Today, plain filter tracking is a saved search plus a monitor. Deeper membership tests (semantic, evaluation, rule, script) are what Signals will add later.

Every relevant page states this split plainly, so a reader never assumes a semantic search counts every match. The Saved searches and Search overview pages carry the clearest version of it.

**Media needed:** a short GIF of a semantic search showing the "ranked sample" banner, captioned in prose so the meaning does not live only in the image.

## Cross-cutting: LLM readability standards (rule 1, made concrete)

These apply to **every** page and become CI-checkable where possible (rule 6). The goal: a page is fully understandable to an agent that fetched it in isolation, with no images, no adjacent-page context, and no visual layout.

- **Answer-first.** Lead with what the thing is and how to do it; put background and edge cases lower. Agents (and humans) extract the top of the page.
- **No load-bearing media.** Every fact shown in a screenshot, GIF, or video is *also* stated in prose. Images illustrate; they never carry the only copy of a step, value, or UI path.
- **Self-contained pages.** No "as shown above on the previous page." Each page restates the minimum context and links out with **descriptive anchor text** (never "click here" or "this").
- **Clean semantic structure.** One H1, logical H2/H3 nesting, real headings (not bold text), short paragraphs, lists for steps.
- **Complete, runnable code.** Code blocks are language-tagged and copy-pasteable; no elided critical lines. Show imports.
- **Define terms on first use** and link to `concepts`; keep one canonical term per idea (ties into the controlled vocabulary above).
- **Stable, descriptive slugs and URLs** so links and agent citations do not rot. This also makes the future Signals rename safe (see phase B and the redirect map).
- **`llms.txt` and `llms-full.txt` healthy.** Mintlify auto-serves both. Verify they regenerate correctly after the restructure, and that the curated `/llms.txt` lists the new Test and Fix and Discovery groups.

---

## Current-state assessment

**Strong already**
- Funnel intro, "How to use Latitude" loop page, and agent-driven `start-tracing` (paste-a-prompt install).
- Deep Observability reference (features/, providers/, frameworks/, agent harnesses/).
- Search, Issues, Evaluations, Monitors, and Security/Compliance groups all exist with `overview` plus `guides/` patterns.

**Gaps and debt**
- **No "Test and Fix" axis at all.** No `datasets/` dir, no regression-testing pages. MCP (`getting-started/mcp`) is buried under "More." `simulations/*` pages exist but are **orphaned** (not in nav).
- **No taxonomy page**, although taxonomy is a shipped feature and belongs under Discovery.
- **8 orphaned pages** exist on disk but are not in `docs.json` (invisible to readers): `getting-started/quick-start-dev`, `getting-started/quick-start-pm`, `observability/overview`, `scores/api`, `simulations/{overview,cli,reporting}`, `telemetry/project-scoping`.
- **Almost no tutorials** (Diátaxis gap).
- **Media:** 34 PNGs, **0 GIFs**, **1 embedded video** (intro only). The article wants a video per section headline and GIFs per subsection.
- **No docs CI** (link and image checking, style lint) and **no "docs for your docs"** contributor guide.
- Security/Compliance pages are stubs, **blocked** on the official SOC 2 report.

---

## Target information architecture

Reconciles the original three-axis proposal with the current nav. This is the **current-product** IA; the Signals migration reshapes the Discovery and Issues groups later (phase B). New or moved items are in **bold**.

| Group | Pages | Diátaxis |
| --- | --- | --- |
| **Overview** | introduction, how-to-use-latitude | Explanation |
| **Getting Started** *(set up and send your data)* | start-tracing, **end-to-end tutorial (new)**, **SDKs (moved in)**, **Providers (moved in)**, **Frameworks (moved in)**, **Agent harnesses (moved in)** | Tutorial / How-to + Reference |
| **Observability** *(the LLM observability building blocks)* | **overview (becomes the group landing)**, traces, sessions, **spans (new)**, **tool calls (new)**, Features (duration, token and cost tracking, metadata, tags, environments, user tracking, log levels, trace ids and urls, filters, sampling, releases and versioning, percentile cohorts), Guides | Reference + Explanation |
| **Discovery** *(rename/group existing)* | search/overview, search/saved-searches, **taxonomy (new)**, flaggers, scores, guides | How-to + Reference |
| **Issues** *(today's auto-discovery surface)* | issues/overview, management, annotations (inline annotations, flaggers), Evaluations (overview, triggers, alignment) | Explanation + How-to |
| **Monitors** *(one concept, many targets)* | overview, **monitor a saved search** (how-to), **monitor an issue** (how-to), notifications and Slack | How-to + Reference |
| **Test and Fix** *(NEW group)* | **Overview**, getting-started/mcp (promoted), **integrate with your agent harness**, **Datasets** (overview, add traces to a dataset, add expected output), **Regression testing** (concepts, with SDKs, in CI), simulations/* (wired in) | How-to |
| **Security & Compliance** | data-protection, pii-redaction, Compliance (soc2, iso-27001, gdpr) | Reference, *SOC 2 blocked on report* |
| **More** | concepts, api-reference | Reference |

Notes on the changes from the previous draft:

- **Instrumentation moves out of Observability into Getting Started.** SDKs, Providers, Frameworks, and Agent harnesses are all "how do I get telemetry flowing," which is setup, not observability. Moving them decongests Observability and gives Getting Started one clear job: get set up and send your data. (See the open question on whether they stay under Getting Started or get their own "Instrumentation" group.)
- **Observability becomes the building-blocks reference:** traces, sessions, spans, and tool calls as first-class pages, then the data and metadata features, then guides. `observability/overview` stops being buried inside "Features" and becomes the group landing.
- **Two building-block pages are missing and must be created:** there is no dedicated **spans** page and no dedicated **tool calls** page today, even though both are core observability concepts. See P0.
- **Monitors is one group, not two siloed "Monitor a X" pages.** A monitor is a single concept that watches a target. Today the targets are saved searches and issues; the how-tos are examples of the same concept, not separate features. This framing is true now and matches where Signals takes monitors (targets become signal, saved search, tool, or raw stream). The cross-links from Discovery (saved searches) and Issues point into this one Monitors group.
- **"scores" replaces the old "signals (scores)" label** in Discovery, and the Issues group lists the real pages (annotations, inline annotations, flaggers, evaluations) instead of grouping them under the word "signals." Scores are the verdict ledger, not a tracked entity.
- **Evaluations stay under Issues** for now because today an evaluation is linked to an issue. Under Signals an evaluation becomes one *type* of signal matcher; that reframing is phase B.

---

## Workstreams and priorities

### P0, structure and the missing axis (highest leverage)
- [ ] **Create the "Test and Fix" group** in `docs.json`; write `test-and-fix/overview.mdx` (the test-and-fix loop). **Media needed:** section-intro video for Test and Fix.
- [ ] **Datasets pages** (new `datasets/`): overview, *add traces to a dataset*, *add expected output*. Cross-link from Issues ("turn this issue's traces into a regression set"). **Media needed:** GIF of adding traces to a dataset, and GIF of adding expected output.
- [ ] **Regression-testing pages**: concept page, plus *with the SDKs*, plus *in CI*. Reuse existing TS and Python SDK content, reframed from "tracing" to "asserting behavior." **Media needed:** GIF of a regression test run (SDK and CI).
- [ ] **Promote MCP** out of "More" into Test and Fix as "Connect your agent harness."
- [ ] **Wire in or delete the 8 orphans** (table below). No page should exist on disk but be unreachable.
- [ ] **Name the Discovery group** and add a **taxonomy** page. **Media needed:** screenshot or GIF of the taxonomy view.
- [ ] **Move instrumentation into Getting Started** (start-tracing, SDKs, Providers, Frameworks, Agent harnesses) and remove the duplicate `start-tracing` that currently sits in both Getting Started and Observability.
- [ ] **Write the two missing Observability building-block pages:** `observability/spans` (what a span is, the span tree inside a trace, span kinds) and `observability/tool-calls` (tool-call spans, their inputs and outputs, errors). **Media needed:** screenshot or GIF of the span tree inside a trace; screenshot of a tool-call span showing its input and output.
- [ ] **Make `observability/overview` the Observability landing page**, leading with traces, sessions, spans, and tool calls before the feature pages.
- [ ] **Unify the Monitors group**: one overview that explains target, metric, alerts, and incidents; the two how-tos become examples. **Media needed:** GIF of creating a monitor from a saved search; GIF of creating a monitor on an issue.
- [ ] **Add the exploration-vs-tracking explainer** to Search overview and Saved searches. **Media needed:** GIF of the semantic-search ranked-sample banner.
- [ ] **Stable slugs and a redirect map.** Lock the slugs that will survive the Issues to Signals rename, and pre-write the `issues/* → signals/*` redirect map so the later migration is a config change, not a link break.

### P1, content quality (Diátaxis and funnel polish)
- [ ] **Define the shared page template** (frontmatter, "where you are" orienting line, "Next step" block) and apply it to every page so the loop pervades consistently.
- [ ] **End-to-end tutorial**: instrument a sample agent, see a trace, search, annotate, see an issue form, add a monitor, then add the traces to a dataset and write a regression test. One continuous narrative across the full loop. (Phase B swaps the "see an issue form automatically" beat for "create a signal"; see the migration section.) **Media needed:** a section-intro video for Getting Started, and a continuous screen recording of the full loop.
- [ ] Add explicit **"Next step"** blocks to every section overview, each pointing to the next loop stage (funnel completion).
- [ ] **LLM-readability pass** on every page: answer-first ordering, no load-bearing media, self-contained, descriptive anchor text, complete runnable code.
- [ ] PNG audit, ensure no screenshot is the *only* place a fact lives; add surrounding prose.
- [ ] **Controlled-vocabulary sweep:** one canonical term per concept, defined in `concepts`, linked on first use. Enforce the "Signal is reserved" rule from this plan.
- [ ] Fold or remove the PM and dev quickstarts (decide: keep as a funnel split, or delete).

### P2, keep-it-from-rotting (rules 4-7)
- [ ] **Docs CI**: broken-link and broken-image check on every PR touching `docs/` (Mintlify `mint broken-links` plus an image-existence check).
- [ ] **LLM-readability lint in CI** where mechanizable: every page has frontmatter `title` and `description`, exactly one H1, no elided code fences, no bare "click here" link text, and a "Next step" block.
- [ ] **Style config** (Vale or equivalent) wired into CI, including the controlled vocabulary as a terms list so synonyms get flagged. Add **"Signal" and "Issue"** to the terms list so the migration's rename is mechanically trackable.
- [ ] **"Docs for your docs"**: a contributor guide plus reuse of the existing `.agents/skills/docs` and `mintlify-preview` skills; document the paste-a-prompt contribution flow.
- [ ] Confirm `/llms.txt` and `/llms-full.txt` render correctly post-restructure.

---

## Orphan and dead-page disposition

| Page | Disposition |
| --- | --- |
| `simulations/overview`, `simulations/cli`, `simulations/reporting` | **Wire into Test and Fix** (regression and simulation testing), or confirm deprecated and delete. |
| `getting-started/quick-start-dev`, `getting-started/quick-start-pm` | **Decide:** keep as a dev and PM funnel split under Getting Started, or delete as superseded by `how-to-use-latitude`. |
| `observability/overview` | Check against `getting-started/introduction#observability`; wire in or delete to avoid duplicate "what is observability" pages. |
| `scores/api` | Wire under Test and Fix or fold into `more/api-reference`. Scores are the verdict ledger and the public `/scores` contract; keep that framing. |
| `telemetry/project-scoping` | Wire into Observability (Guides) or delete. |

---

## Media shot-list (video per headline, GIF per subsection)

Per rule 1, no clip becomes load-bearing. Every clip is illustrated *and* described in prose. Insert `<Frame>` placeholders and a recording checklist; the team records. Every item below is a **Media needed** entry.

**Section-intro videos (one each):** Overview (exists), Getting Started / Start tracing, Observability, Discovery, Issues, **Test and Fix**, Security.

**Subsection GIFs (current product, priority):**
- Discovery: running a semantic search (with the ranked-sample banner); saving a search; the taxonomy view.
- Monitors: creating a monitor from a saved search; creating a monitor on an issue; an incident notification arriving (in-app, email, and Slack).
- Issues: leaving an inline annotation; an issue forming from annotations and scores; generating an aligned evaluation.
- Test and Fix: adding traces to a dataset; adding expected output; a regression test run (SDK and CI).

Phase B adds its own media list once Signals ships (see below). Do not record the phase-B clips until the UI is final.

---

## Signals migration (phase B)

These changes only make sense once `specs/signals.md` ships. Hold them until then. Doing them early would make the live docs describe a product that does not exist yet. Each item notes its media impact.

- **B1. "Issues" group becomes "Signals."** Rename the group and pages; "Issue" stops being a canonical term and becomes a legacy term that redirects. Apply the `issues/* → signals/*` redirects prepared in P0. **Media needed:** new Signals list and Signals detail screenshots; retire issue-list screenshots.
- **B2. Drop the automatic-discovery story.** Remove "an issue forms automatically" and any clustering language. Replace with deliberate creation: from the Signals page, from a saved search ("Create signal from this search"), or from the annotation flow. **Media needed:** GIF of creating a signal (semantic and rule); GIF of "Create signal from this search"; GIF of "Track this as a signal" in the annotation flow. Retire the "issue clustering" GIF.
- **B3. Add the new Signals surface pages:** Signals overview; **signal types** (semantic, evaluation, rule, script); **scope and threshold/sensitivity**; **creating a signal** (the three entry points); **occurrences vs scores** (occurrences are the counting unit, scores are the verdict ledger). **Media needed:** screenshot of the signal detail page (definition, monitor charts, alerts, incidents, member traces); GIF of the create-signal builder with its live preview.
- **B4. Reframe Evaluations as one signal type.** Move evaluations under Signals; explain `evaluations.signal_id`; redefine alignment as predicted-vs-actual *signal* membership. **Media needed:** none new beyond B3, reuse the aligned-evaluation GIF reframed onto a signal.
- **B5. Generalize the Monitors pages.** Document the four target types (signal, saved search, tool, raw stream), **metric monitors** (avg, sum, p95 of duration, ttft, cost, tokens, errors), and the renamed alert kinds (`event.matched`, `event.regressed`, `metric.threshold`, `metric.escalating`). **Media needed:** GIF of a metric monitor (for example, average cost of a signal's traces); GIF of a tool monitor.
- **B6. Retire the "Issue discovered" system monitor in the docs.** Under the spec `issue.new` is gone; the default monitor is escalating in `expected` mode plus `event.regressed`. This is the one statement in the *already-shipped* monitors page that will flip, so it is the first thing to change at migration. **Media needed:** updated system-monitor screenshot.
- **B7. Correct the Scores pages.** Scores are the verdict ledger (evaluation pass/fail/error analytics, human-feedback ground truth for alignment, and the public `/scores` API), not membership. Counting moves to occurrences. **Media needed:** none.

**Vocabulary at migration:** the controlled-vocabulary list becomes Trace, Span, Session, Saved search, **Signal**, Monitor (and target), Alert, Incident, **Occurrence**, Dataset, Regression test. "Issue" is removed.

---

## Open questions and blockers
- **Instrumentation placement.** Put SDKs, Providers, Frameworks, and Agent harnesses under Getting Started (one larger group), or split them into a dedicated "Instrumentation" group so Getting Started stays a short funnel? The plan currently folds them into Getting Started, matching the intent that "getting started" means "get your data in." *(Decision needed.)*
- **Overhaul timing.** Does this ship before Signals (apply "now", hold phase B) or alongside Signals (do everything, merge only when the feature does)? This governs how much of phase B is in scope. *(Decision needed.)*
- **Signals depends on the sandbox runtime.** `specs/signals.md` requires `specs/sandbox-runtime.md`, which is not built. `rule` and `script` signal types cannot be documented as shipped until that lands. Confirm the timeline before scheduling B3 and B5. *(Blocked on the dependency.)*
- **Tool analytics surface.** The spec assumes a tool metrics reader for tool monitors. Tool analytics exist at the API and MCP layer, but the exact repository the spec names should be verified before writing the tool-monitor how-to. *(Verify.)*
- **SOC 2:** Compliance pages stay stubbed until the official report lands. *(Blocked.)*
- **Taxonomy scope:** confirm the user-facing surface area before writing the page.
- **Simulations:** are `simulations/*` current or deprecated? Drives wire-in vs delete.
- **PM and dev quickstarts:** keep (funnel split) or delete?

## Acceptance criteria
- Every nav group answers what/why, then quickstart, then next steps.
- Zero orphaned pages; zero broken links or images (enforced in CI).
- "Test and Fix" axis exists with Datasets, regression testing, and MCP.
- Every page tagged with a Diátaxis type; at least one true end-to-end tutorial.
- **Every page locates itself in the loop** (orienting line and "Next step" to the next stage) using the controlled vocabulary.
- **Every page passes the LLM-readability bar:** understandable when fetched in isolation (no load-bearing media), answer-first, one H1, descriptive frontmatter and anchor text, complete runnable code. The mechanizable subset is enforced in CI.
- **The Signal/Issue terminology collision is resolved:** "Signal" is reserved for the future entity and never used for scores or annotations; the `issues/* → signals/*` redirect map exists and slugs are stable.
- **Exploration vs tracking is explained** on the Search overview and Saved searches pages.
- `/llms.txt` and `/llms-full.txt` regenerate correctly and include the new groups.
- Each section headline has an intro video placeholder and shot-list; key subsections have GIF placeholders.
