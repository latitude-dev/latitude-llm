# AI benchmark optimizer

> **Documentation**: `docs/ai-benchmarks.md`

You can see we have @./docs/ai-benchmarks.md, which is a way to assess the
baseline of our AI features like flaggers or enrichment generators. I started
working on the jailbreak flagger benchmark but I left something pending and also
this document is to spec the main subject which is the AI benchmark optimizer.
But first the changes I want from previous work:

### Benchmark baseline (DONE, ignore this for the optimizer spec)
Now when running the benchmark for a flagger with `--update-baseline` we store a
json report with some details about true positives, false positives, true negatives and false negatives. and a row for each test case. I think this is too much it produce huge json payloads that we commit to git. I want reduce the amount commited. I want to keep the resume but only commit the rows that failed, so we can have a better idea of what changed in the baseline and also reduce the amount of data commited. Let me know if you have any question about this.

### AI benchmark optimizer
We have GEPA implemented for optimizing the the evalutions associated to issues.
I dont want to mix the optimazer in that code with the optimizer for the AI
benchmark. I think are different use cases and we nned to investigate here
what's the best way of using our current way of calling the GEPA optimizer but
in the context of the AI benchmark.

The idea would be add a new functionality to the benchmark runner to run the
`--optimize` flag and then it will use the GEPA optimizer to optimize the baseline of the benchmark. We need to spec how this will work, how we will call the optimizer, what parameters we will pass, how we will update the baseline after the optimization, how many steps we will run the optimizer, does it need to run the full dataset or can we run it with a subset, we need to consider costs of running the optimizer and how to minimize them, etc.

### Next steps

Re-ordered to de-risk unknowns first (per OQ16 in the prior draft).

- [x] Reduce the amount of data commited to git for the benchmark baseline.
- [x] Spec the AI benchmark optimizer (this document).
- [ ] **Quantify**: count of rows reaching the LLM under current pre-filter, and
      ballpark cost of one full optimization run on `flaggers:jailbreaking`
      with default proposer config.
- [ ] **De-risk the proposer scaffolding**: build the flagger-side proposer
      system prompt + output schema and run a 10-row, 60s-budget optimization
      against `flaggers:jailbreaking` end-to-end. Surfaces the unknowns in
      Python toolchain, telemetry seam, and trajectory shape cheaply.
- [ ] Implement the full optimizer (CLI + reporting + audit JSON + MD report).
- [ ] Seed `tools/ai-benchmarks/optimizations/flaggers/jailbreaking/proposer-notes.md`
      with the placeholder content from S1 so the convention is
      visible in the repo from day one.
- [ ] Manual test the optimizer and observe how it performs on the baseline.
- [ ] Evaluate cost and decide on default sampling policy.
- [ ] Document the optimizer in `docs/ai-benchmarks.md`, including the
      `--proposer-notes` mechanism, the conventional notes-file location,
      and the use cases (avoid-dep / taste / rejection-rationale).

---

## Strategic decisions

Two strategic questions that rule over the tactical ones below. Both
were posed by you; both have a recommendation here.

### S1 — Should GEPA tune more than the system prompt?

**Decision: Yes. The candidate is the strategy `.ts` file itself,
mutated free-form within an interface contract.** GEPA mutates
`packages/domain/annotation-queues/src/flagger-strategies/jailbreaking.ts`
directly — the proposer reads the full file source + trajectories and
returns the full new file source. The `Optimizer` TS interface is
**unchanged**: one `OptimizationCandidate` per iteration whose `text`
is the TypeScript source. Python only ever sees the hash; the source
text lives entirely in the TypeScript wrapper's `candidateByHash` map.

This is "code optimization" in the literal sense — no JSON protocol,
no bundle codec, no translation step. The artifact GEPA optimizes is
the same artifact that ships.

Reasoning:

- **Your "fail in production" point lands.** Bypass-and-manual-audit
  leaves every regex-short-circuited row broken in production. We
  must let GEPA tune the regex layer, not just the prompt.
- **The artifact is the file.** Translating to JSON and back invents
  a wire format we then have to keep in sync with the strategy. Cleaner:
  the proposer edits the file; the user copies the winning file in.
  Git diff is the reviewable record at the source-of-truth level.
- **Python sees hashes.** Per `op_gepa_engine/core/gepa.py`
  (`type Script = str  # <script hash>`), the wire payload is just an
  opaque identifier. The 30 KB TS file travels nowhere — it sits in
  `candidateByHash` on the TS side and the proposer LLM is invoked
  locally. No wire-protocol pressure.
- **No port change.** `apps/workflows/src/activities/evaluation-optimization-activities.ts`
  is untouched. Single-component, single-candidate.
- **The CTO's cost instinct is preserved.** Deterministic pre-filter
  stays; GEPA tunes its regex patterns against the fixture instead of
  us throwing them out — and may even discover a non-regex deterministic
  approach that works better.

#### Free-form vs strict-structured: study of your challenge

Two flavors of "GEPA optimizes the .ts file":

**(A) Strict-structured.** Mark specific named declarations as mutable
(`JAILBREAK_SYSTEM_PROMPT`, `HIGH_PRECISION_JAILBREAK_PATTERNS`,
`directPatterns`, `indirectPatterns`). Use TS AST to extract those
nodes, expose only their bodies to the proposer, splice the proposer's
edits back in. Helper functions, control flow, deterministic logic
shape — all locked.

**(B) Free-form within an interface contract.** Show the proposer the
full file. It can rewrite anything: rename helpers, restructure the
snippet extractor, replace regex with a different deterministic
approach (length-bounded scoring, n-gram heuristic, whatever). The
guardrails are about *outer shape* (imports unchanged, exports present,
no dangerous APIs), not about *inner content*.

**The case for (B)**:

- The whole point of letting an LLM proposer see code is to let it
  use that visibility. Strict-structured re-introduces the
  JSON-protocol problem in different syntax — same prompt + same
  regex lists, just expressed via AST nodes instead of JSON
  fields.
- Your specific motivation — the regex pre-filter underperforming
  on this fixture — is exactly the kind of thing where the
  proposer might find a structurally different solution. With
  strict-structured, GEPA can only nudge the existing patterns.
  With free-form, it could (if trajectories support it) propose
  "drop high-precision regex entirely; instead, do a tagged-snippet
  vote between three reasons before short-circuiting" — a real
  algorithmic change inside the same `detectDeterministically`
  surface. That's where GEPA actually shines.
- The safety story works equally well for both: the boundary that
  matters is "doesn't add scary imports / doesn't call dangerous
  APIs / honors the QueueStrategy interface", and that boundary is
  enforceable on free-form text just as well as on AST-extracted
  snippets.

**The case against (B)**: a free-form proposer can write code
that's harder to review, can introduce subtle behavior changes
that a regex-list edit can't, and can produce candidates that pass
the safety scan but still misbehave at runtime (infinite loops,
unhandled cases). That's why we need worker isolation + timeouts
+ runtime shape validation, not just static scan.

**Conclusion: go with (B), free-form.** The guardrails described
below contain the realistic failure modes; the upside (algorithmic
freedom) is what you're trying to unlock.

#### Concrete loop

1. **Baseline**: `fs.readFile("flagger-strategies/jailbreaking.ts")`
   → hash → baseline `OptimizationCandidate`.
2. **Propose**: proposer LLM receives the full file text + JSON-shaped
   trajectories. It returns the complete new file text.
3. **Evaluate**: per candidate (cached after first row of the
   iteration), compile candidate text → JS via `esbuild` (in-memory,
   ms-fast), dynamic-import the result, read the exported
   `<queueSlug>Strategy: QueueStrategy`, run it against the row inside
   a worker.
4. **Adopt winner**: `fs.writeFile("flagger-strategies/jailbreaking.ts", winnerText)`.
   Git diff is the reviewable record.

#### Strategy parameterization (revises OQ2)

`classifyTraceForQueueUseCase` gains an optional
`strategyOverride: QueueStrategy` parameter. When present, it
replaces the lookup-by-`queueSlug`. Production passes nothing;
benchmark passes the candidate-loaded strategy. Single, narrow seam
— no `flaggerOverride`, no `systemPromptOverride`, no field-by-field
plumbing.

#### Safety guardrails (LLM-emitted code is real runtime code)

- **Static safety scan applied at propose-time, with retry.** The
  `propose` callback runs the static scan immediately on the
  proposer's output. If it fails, the proposer is invoked again
  (up to 2 retries) with a feedback message:
  *"Your previous proposal failed validation: [reason]. Try again."*
  We deliberately do **not** enumerate the available imports
  up-front in the system prompt — doing so would bias the proposer
  toward the listed set and suppress the "I really wish I had X"
  signal, which is exactly the data we want surfaced via
  `reasoning`. The proposer is left free to reach for what it
  thinks would help; runtime resolution is the boundary; the retry
  gives the proposer the error and lets it adapt.

  If all retries fail, the candidate goes through to evaluate and
  scores 0. The rejection reason rides into the trajectory
  feedback so the next reflection round sees it.

  Cost trade-off: one bad proposal recovered at propose-time costs
  one extra proposer call (~$0.20) and zero evaluate calls. Letting
  it through to evaluate would cost ~N evaluate-stage-1-rejects
  (cheap individually but adds up across iterations of grinding,
  with no learning signal until stagnation kicks in).

- **Operator notes** *(opt-in dev steering)*. A
  `--proposer-notes <text>` or `--proposer-notes-file <path>` flag
  on `benchmark:optimize`. Whatever the dev provides is appended to
  the proposer system prompt verbatim, in an "Operator notes"
  section, framed as soft guidance ("treat these as preferences,
  not hard constraints — the static scan still validates structure
  regardless"). Default = no notes; proposer is fully unbiased.
  Use cases:
  - Preventing the proposer from converging on a dep the dev
    decided is unwelcome ("avoid `tldts`"; runtime might allow it
    but operator doesn't want it).
  - Steering toward a class of solution the dev prefers for taste
    or maintenance reasons ("prefer regex-based deterministic
    checks over heuristic scoring").
  - Capturing rejection rationale across runs (the dev rejected a
    prior winner; instead of having to re-reject every iteration
    of the next run, the rejection reason goes into a notes file).

  Notes are recorded verbatim in the audit JSON so two runs with
  different operator notes are clearly different experiments.

  **Conventional file location** (auto-loaded if present, no flag
  required):

  ```
  tools/ai-benchmarks/optimizations/<target-path>/proposer-notes.md
  ```

  Committed to git (this is dev-curated input, unlike the
  timestamp-named `*.json` audit and `*.md` reports which are
  gitignored / committed-on-adoption). `--proposer-notes-file`
  overrides the conventional location for one-off runs.
  HTML comments (`<!-- ... -->`) are stripped before injection so
  the file can carry operator-facing scaffolding the proposer
  doesn't see.

  For `flaggers:jailbreaking` the file lives at:

  ```
  tools/ai-benchmarks/optimizations/flaggers/jailbreaking/proposer-notes.md
  ```

  Seed content (committed alongside the optimizer landing PR):

  ~~~markdown
  <!--
  Operator notes for `benchmark:optimize --target flaggers:jailbreaking`.

  This file is read at run start and appended to the proposer
  system prompt as soft guidance. HTML comments are stripped before
  the proposer sees the file — keep operator-facing scaffolding in
  comments and operator-to-proposer guidance in the body.

  Use cases:
   - Discourage a dependency you don't want adopted in this strategy
     ("avoid `tldts`").
   - Express a taste preference ("prefer regex over heuristic scoring").
   - Persist rejection rationale across runs ("a previous winner used
     X; the team rejected because Y, please don't go down that path").

  Leave the body as-is if you have no preference for this run.
  -->

  The operator running this optimization has not expressed
  preferences. Use your best judgment based on the trajectories.
  ~~~

- **Static-scan rules.** TS AST parse. Reject if any of:
  - **Any import that doesn't resolve from the strategy file's
    package context.** This is the workspace-trust boundary: the
    proposer can use anything already in
    `packages/domain/annotation-queues/package.json` (or its
    transitive deps), workspace modules under `@domain/*`,
    `@repo/utils`, `@repo/observability`, and relative paths under
    `flagger-strategies/`. **The optimizer never edits
    `package.json`** — new npm deps require human action: dev adds
    the package, commits, re-runs optimization. The proposer's
    `reasoning` field surfaces "I would have used X" suggestions
    so the human knows what to consider installing.
  - **Architectural-layer violations**: imports from `@platform/*`
    (infrastructure adapters) or `@apps/*` (HTTP layer). Even if
    resolvable, these would be layering violations a human PR
    reviewer wouldn't approve. The static scan rejects them
    automatically.
  - **Dangerous intrinsics by name**, regardless of import source:
    `process.*`, `child_process`, `fs`, `net`, `vm`, `eval`,
    dynamic `import(...)`, `require(...)`, `Function(...)`
    constructor, `globalThis.*` writes, top-level await with side
    effects.
  - The export shape is missing (must export
    `<queueSlug>Strategy: QueueStrategy` with all 4 methods:
    `hasRequiredContext`, `detectDeterministically`,
    `buildSystemPrompt`, `buildPrompt`).
  - **Adoption-time gate.** When the user accepts a winner, the
    "Adopt?" prompt explicitly lists every *new* import that wasn't
    in the baseline file — separate from the rest of the diff —
    so the human is informed about dependency additions before
    saying yes. Optimizer surfaces; human gates.
- **No worker isolation in v1; direct dynamic import in the parent
  process.** Rationale: dev-only context (no CI, no production), Opus
  4.7 trusted proposer, static scan already rejects the dangerous-
  intrinsic surface. Worker isolation is primarily about hard-killing
  runaway-CPU candidates (catastrophic regex backtracking) — a real
  concern but bounded in dev (manifests as "optimizer hangs; dev hits
  Ctrl-C") and a much bigger implementation lift than the realistic
  threat warrants. **v2 adds it** (see "v2: Worker isolation
  (planned)" at the end of this spec) when we have evidence of need.
- **Per-call async timeout.** 5s wall-clock via `Promise.race` per
  `detectDeterministically` / `buildSystemPrompt` / `buildPrompt`
  call. Catches promise-based hangs cleanly. **Caveat**: a
  synchronous CPU loop (regex backtracking on a method that returns
  a value, not a promise) blocks the JS event loop and the timeout
  never fires until the loop finishes. v1 accepts this; v2 fixes it
  via `worker.terminate()`.
- **Process-level watchdog.** If a single iteration takes more than
  10 minutes wall-clock, the optimizer SIGKILLs itself (and prints a
  diagnostic line first if possible). Crude but bounds the
  worst-case runaway in v1.
- **Soft regex DoS sniff** (warning, not rejection). Static scan
  flags candidates whose regex literals contain deeply-nested
  quantifiers (`(.*)*`, `(a+)+`, etc.) — surfaces in the iteration
  table's Notes column, doesn't block the candidate. Cheap heuristic
  to nudge attention toward likely-pathological patterns.
- **Errors → score 0.** Compile error, import error, runtime error,
  shape error, timeout — any of these score the row 0 across the
  board. GEPA stagnation prunes broken candidates within
  ~10 iterations.

The proposer is Opus 4.7 with `xhigh` reasoning. The realistic
failure mode is "bad code that throws", not "malicious code that
exfiltrates". Static scan + async timeouts + watchdog make the
bad-code-that-throws case cheap; the runaway-regex case remains
"dev hits Ctrl-C" until v2.

**v1 overhead estimate**: ~5-20ms per candidate first call (esbuild
compile + dynamic import via Blob URL), cached thereafter. For ~700
rows × 30 iterations that's <1s total overhead — trivial vs. LLM
latency.

#### What this revises in the prior decisions

- Optimizer scope (was Q2.1): the `.ts` file is the candidate.
  Single component on the wire; full source on the TS side.
  Free-form mutation within interface contract + safety scan.
- Strategy parameterization (was OQ2):
  `strategyOverride: QueueStrategy` on `classifyTraceForQueueUseCase`.
  No `flaggerOverride`, no `systemPromptOverride`.
- Pre-filter handling (was Q2.11): GEPA tunes the pre-filter
  in-place, including potentially restructuring it.
  `--bypass-prefilter` becomes a `benchmark:run` debugging flag,
  not the optimization strategy.
- Validation of proposed output (was OQ6): TS AST shape check +
  import-list check + dangerous-API denylist + runtime
  `QueueStrategy` shape check. (See Safety guardrails.)
- Output artifacts (was Q2.3): MD report shows the unified diff
  between baseline file and winning file, plus before/after F1.
  Audit JSON keeps each candidate's full file text + score history.

#### Open trade-offs

- **Token cost per propose**: proposer reads + emits the entire file
  every iteration, even when only one declaration moved. Higher
  per-call cost than a small-string edit. Mitigations: trajectory
  feedback tells the proposer where to focus; budget caps clamp
  total spend; quantify during de-risking step.
- **Search space**: bigger (the file's whole AST) → more iterations
  to converge. Quantify during de-risking.
- **Forfeited GEPA features**: `module_selector="round_robin"` and
  `use_merge` only operate over multi-component systems and are
  no-ops for a single component. The proposer LLM has to do both
  jobs implicitly — pick which sub-region to mutate, recombine
  ideas across iterations. For a 1-flagger, ~30-iteration run this
  is fine.
- **New imports allowed if resolvable from the strategy file's
  package context** — workspace modules and any npm package
  already in `packages/domain/annotation-queues/package.json` (or
  its transitive deps) qualify. The optimizer never edits
  `package.json`; new npm deps require deliberate human action
  (install + re-run). `@platform/*` and `@apps/*` stay forbidden
  as layering violations even when resolvable. The intrinsic
  denylist applies regardless of import source. The reviewer sees
  every new import at adoption time as an explicit gate.

#### Generalizing to other targets

The safety guardrails above (static safety scan, worker isolation,
runtime timeouts, AST shape probe) exist because **LLM-emitted code
needs containment**. They are specific to candidates whose `text`
is executable TypeScript. They do **not** apply universally to
every future optimization target.

The annotator family (benchmark Phase 4) is the most obvious
counter-example. The annotator's optimizable surface is most likely
its **prompt template** — a string interpolated with `${conversation}`
and fed to an LLM. There's no compile, no `import`, no runtime to
contain. Static-scan rules for AST imports / dangerous intrinsics
are meaningless on a prose paragraph; worker isolation has nothing
to isolate.

To keep the optimizer scaffolding from leaking flagger-specific
assumptions into other targets, each target's registry entry
declares a `candidateKind`. The optimizer dispatches on it:

| `candidateKind` | Used by | Validation | Execution path |
|---|---|---|---|
| `"ts-module"` | flaggers | static AST scan + import resolution + dangerous-intrinsic denylist + `QueueStrategy` shape probe | esbuild → worker thread → per-method timeouts |
| `"text-template"` | annotators (future), LLM-as-judge optimizers (future) | length bounds + template-variable check (e.g. `${conversation}` present, no extra unfillable placeholders) | direct prompt rendering — no isolation, no compile, no worker |

Modules in `tools/ai-benchmarks/src/optimize/` split along this seam:

- **`optimize/safety-scan.ts`** — `ts-module`-specific. Imported only
  by `ts-module` targets.
- **`optimize/candidate-loader.ts`** — `ts-module`-specific (esbuild +
  worker spawn). Imported only by `ts-module` targets.
- **`optimize/text-template-validator.ts`** (future) —
  `text-template`-specific. Imported by annotator-style targets.
- **`optimize/<family>/proposer.ts`** — always per-family. The
  proposer system prompt for a flagger talks about a TS module + an
  interface contract; the proposer system prompt for an annotator
  talks about a prompt template + a placeholder set. Different
  prompts, different output schemas (`{ reasoning, fileText }` vs
  `{ reasoning, templateText }`).
- **The audit-trail wrapper, MD report renderer, iteration printer,
  cost meter** — all target-agnostic. They consume an
  `OptimizationCandidate` and the `candidateKind` decides only
  small per-cell rendering choices (e.g. the iteration table's
  "Changed" column shows AST-decl diffs for `ts-module` and
  template-section diffs for `text-template`).

What this preserves: future `text-template` optimization for
annotators won't pay the worker-isolation tax it doesn't need, and
future readers of the codebase see a clean separation between
"executable-code optimization" (containment-heavy) and
"text optimization" (containment-free). Adding a new
`candidateKind` later — say a structured-config target that
optimizes JSON files — is a third entry in this matrix without
disturbing either of the existing two.

### S2 — `--optimize` flag on `benchmark:run` vs. separate `benchmark:optimize` script?

**Decision: separate `benchmark:optimize` script.**

Reasoning:

- **Different runtime profile.** `benchmark:run` is seconds-to-minutes
  on a full fixture. `benchmark:optimize` is hours. Conflating them
  means the same command sometimes returns instantly with metrics and
  sometimes locks the terminal for 2 hours.
- **Different output.** `benchmark:run` produces an ink TUI of failures
  + flips. `benchmark:optimize` produces an iteration table + a winning
  candidate + an audit JSON + an MD report. Mixing the renderers makes
  both worse.
- **Different flag space.** `--optimize` already accumulates incompatible-
  flag rules (rejects `--update-baseline`, requires `--only`, optional
  `--sample` semantics differ, etc.). A separate command makes those
  constraints obvious in the script signature instead of as runtime
  errors.
- **Code reuse is fine without one command.** Fixture loading, the
  classifier wiring, metric computation, and stratified sampling already
  live in `tools/ai-benchmarks/src/runner/`. Both scripts consume those
  modules; nothing duplicates.

Concrete CLI:

```bash
pnpm --filter @tools/ai-benchmarks benchmark:optimize \
  --target flaggers:jailbreaking \
  [--bypass-prefilter] \
  [--budget-time 7200] \
  [--budget-tokens 100000000] \
  [--sample 200] \
  [--seed 0xbeefcafe]
```

`--target` (singular) replaces `--only` to make per-target-only
semantics obvious. `--update-baseline` is not a flag here at all.

---

## Decisions (resolved)

Decisions consolidated from your responses across drafts. Each item
references the original question for traceability.

- **Optimizer scope** *(was Q2.1, Critique #3)*: **The strategy `.ts`
  file is the candidate**, per S1. GEPA optimizes the file's source
  text directly with free-form mutation under an interface contract
  (must export `<queueSlug>Strategy: QueueStrategy`, no new imports,
  no dangerous APIs). The `Optimizer` TS interface is unchanged —
  one `OptimizationCandidate` per iteration whose `text` is the TS
  file source.

- **Strategy parameterization** *(was Q2.2(a), OQ2)*: Add an optional
  `strategyOverride: QueueStrategy` parameter to
  `classifyTraceForQueueUseCase`. When present, replaces the
  lookup-by-`queueSlug`. Production passes nothing; benchmark's
  `evaluate` compiles the candidate file, dynamic-imports it, reads
  the exported `QueueStrategy`, and passes that as the override. No
  field-by-field plumbing; one narrow seam.

- **Per-row scoring** *(was Q2.4)*: Binary —
  `score = (predicted === expected) ? 1 : 0`. No asymmetric weighting.

- **Optimization output artifacts** *(was Q2.3(c), Q2.10, OQ3)*:
  - **JSON audit trail** at
    `tools/ai-benchmarks/optimizations/<target-path>/<timestamp>.json`:
    every candidate proposed (full file text), every per-row score,
    the winner. **Gitignored.**
  - **MD report** at the same prefix, `<timestamp>.md`: human-readable
    summary with the unified diff between the baseline file and the
    winning file as a fenced block, before/after F1, iteration table.
    **Committed by the human after inspection.** Mirrors the
    `--update-baseline` discipline.
  - **Target path uses nested folders** (`flaggers/jailbreaking/`) for
    consistency with `baselines/`. Avoids `:` vs `__` portability.
  - **Audit-trail capture is benchmark-side wrapping.** The
    `Optimizer` port returns only `{ optimizedCandidate }`. To produce
    the JSON audit, the `evaluate` and `propose` callbacks defined
    inside `benchmark:optimize` push records to an in-memory trail as
    they fire, then we serialize at the end. This is internal to
    `benchmark:optimize`; `benchmark:run` is unaffected.

- **Workflow after optimize** *(was Q2.8(c), with OQ7 UX add-on)*:
  After GEPA returns, the script:
  1. Prints the unified diff (baseline file → winning file) +
     before/after F1.
  2. Auto-runs a final measurement pass with the winning candidate
     applied (via `strategyOverride`) and emits the would-be
     baseline diff so the user sees the row changes immediately.
  3. Writes the JSON audit + MD report.
  4. **Prompts the user**: "Adopt this winner? [y/N]". On `y`,
     writes the winning file text over the strategy `.ts` file
     (e.g. `flagger-strategies/jailbreaking.ts`), then runs
     `benchmark:run --update-baseline` to refresh the committed
     baseline. On `N`, exits — the user copies the file manually
     if they want.

- **Selection / flag interactions** *(was Q2.9)*:
  - `--target` is required and accepts exactly one target.
  - `benchmark:optimize` is a separate command (S2); no
    `--update-baseline` flag here — it's offered by the post-run
    prompt above.
  - `--sample N` allowed; semantics in OQ3 below.

- **v1 target scope** *(was Q2.12)*: Flaggers only for v1.
  Generalization to other target families is handled by the
  `candidateKind` dispatch described in S1 §"Generalizing to other
  targets". Flaggers use `candidateKind: "ts-module"`. The annotator
  family (Phase 4) is most likely `candidateKind: "text-template"`
  and will reuse the audit/report/iteration/cost scaffolding without
  inheriting any of the code-execution guardrails (worker isolation,
  AST scan, runtime timeouts) that are specific to executable
  candidates. Adding `text-template` support is a follow-up; v1 ships
  with `ts-module` only.

- **Proposer scaffolding location** *(was OQ1)*: Inside
  `tools/ai-benchmarks/src/optimize/`. Split between target-agnostic
  modules, candidate-kind-specific modules, and per-family modules
  (per the matrix in S1 §"Generalizing to other targets"):
  - **Target-agnostic** (used by every target):
    `audit-trail.ts`, `report-renderer.ts`, `iteration-printer.ts`,
    `cost-meter.ts`.
  - **`ts-module`-kind-specific** (used by flaggers, future code-as-
    candidate targets): `safety-scan.ts` (TS AST scan + import
    resolution + dangerous-intrinsic denylist + shape probe),
    `candidate-loader.ts` (esbuild compile + worker-thread spawn +
    timeout-wrapped method calls).
  - **`text-template`-kind-specific** (future, annotators): a
    lightweight `text-template-validator.ts` (length bounds +
    placeholder-variable check). Not built in v1.
  - **Per-family** (one per target family):
    `flagger/proposer.ts` (system prompt + output schema
    `{ reasoning, fileText }` + propose-call wrapper),
    `flagger/report.ts` (MD renderer with unified-diff block +
    per-tactic F1 deltas).

- **Iteration count budget** *(was OQ6, Critique #5)*: Drop
  `--max-iterations` for v1. Rely on `--budget-time`, `--budget-tokens`,
  and GEPA's built-in `MAX_STAGNATION = 10` to terminate. No port
  extension on this axis.

- **Proposer model** *(was OQ7)*: Reuse `GEPA_PROPOSER_MODEL`
  (Opus 4.7, `xhigh` reasoning). Same constant, same config. Cost
  controlled by budgets and sampling.

- **Telemetry** *(was OQ9, Critique #6)*: No telemetry from the
  benchmark optimizer. No-op telemetry capture; production dashboards
  stay clean.

- **Cost reporting in the optimizer** *(new — your question on OQ3)*:
  **Yes, the optimizer captures cost in the iteration table and the
  MD report.** Per-iteration cost = proposer call tokens × proposer
  model price + judge call tokens × judge model price (both via the
  existing `@domain/models` pricing tables). Total cost is the sum
  across iterations. The proposer call cost is captured by metering
  the AI-generate call inside the propose callback (same
  `meteringAIGenerateLive` shape as `benchmark:run` uses for judge
  calls).

- **Python toolchain** *(was OQ10, Critique #7)*: Assume it works
  from `tools/ai-benchmarks`; fix dev setup if not. Part of the
  de-risking step in Next Steps.

- **Starting candidate for optimization** *(was OQ13)*: Always read
  the current strategy `.ts` file from disk at run start. Local
  uncommitted edits feed in. No baseline-shape change.

- **CI** *(was OQ10)*: Not in CI. Local dev tool.

- **Pre-filter handling during optimization** *(was Q2.11, OQ5,
  superseded by S1)*: GEPA mutates the entire strategy file
  free-form, including the pre-filter logic — it can tune regex
  patterns, restructure them, or even propose a non-regex
  deterministic check inside `detectDeterministically`.
  `--bypass-prefilter` remains as a `benchmark:run` debugging flag
  (useful for isolating "what would the LLM do if the regex never
  short-circuited") but is **not** the optimization strategy.

---

## Open questions

Fresh numbering, only what is still unresolved. Numbered for easy
back-reference in code review and follow-up specs.

### OQ1 — Trajectory feedback format for the proposer

**Resolved on shape. Two follow-up choices remain.**

Decision: `OptimizationTrajectory.feedback` carries a JSON-formatted
string per row, not free-form English. With file-as-candidate (S1),
the proposer needs structured signal so it can locate which *layer
of the strategy* failed — was the regex pre-filter wrong (and the
LLM never even ran)? did the LLM see the right context but make
the wrong call? JSON parses unambiguously. The schema field type
stays `z.string()`; we put JSON inside it.

Per-row JSON shape:

```json
{
  "expected": true,
  "predicted": false,
  "phase": "deterministic-no-match",
  "tags": ["persona-aim", "jailbreakbench:pair"],
  "preFilter": {
    "highPrecisionMatched": false,
    "extractedSnippets": [
      { "source": "user", "reason": "role/persona manipulation", "text": "Pretend you are…" }
    ]
  },
  "llmVerdict": null
}
```

`llmVerdict` is non-null only on `llm-*` phases. `preFilter` carries
exactly what the candidate's strategy methods returned during
evaluation. **The pre-filter signals are required** — without them
the proposer can't tell which layer of the strategy file to mutate.
(It's the difference between "the LLM got this wrong" and "the
regex never even let the LLM see this".)

**Open** (your call):
- Trajectories sent to each proposer call: all rows, or only the
  misclassified ones (`predicted !== expected`)? GEPA's reflective
  proposer benefits most from failures; correctly-classified rows
  add cost without much signal. Default if you don't pick: send
  misclassified rows only, capped at e.g. 30 trajectories per
  iteration (sample if more), with a one-line summary line at the
  top: "23 misclassifications out of 200 evaluated; sampling 30 for
  context."
- `conversationText` length: full join (cheap-and-honest, cost goes
  up on long traces) vs truncated (head/tail with middle summary).
  Default if you don't pick: full join.

### OQ2 — Train/val split policy

**What stratification means here.** When GEPA splits the fixture into
a train set (rows whose scores drive iteration choices) and a val set
(rows that validate the winning candidate), naive random sampling can
produce skewed splits. With ~700 positives and ~200 negatives, a
uniformly random 80/20 split could land most negatives in val by
chance — train would be almost all positives, the proposer would
optimize a prompt that catches positives but rarely sees negatives,
and val collapses.

Stratified split = group rows by some label first, then split each
group separately at the same ratio. Both splits represent the full
distribution.

- **Binary stratification** (recommended for v1): group by
  `expected.matched`. Train and val each get 80/20 of positives and
  80/20 of negatives.
- **Multi-key stratification** (deferred): group by
  `expected.matched × tactic-tag`. Keeps every tactic represented in
  both splits. Worth doing if we observe the proposer struggling on
  specific tactics — but binary is enough for v1.

Decisions:

- **Reuse `splitOptimizationExamples`** from `@domain/optimizations`.
  Deterministic + seeded.
- **Stratify on `expected.matched`** (binary).
- **Default ratio: 80/20.** Larger fixture than eval flow's typical
  alignment dataset, so we can afford the smaller val proportion
  without losing statistical signal.
- **Seed**: reuse `0xbeefcafe`; expose `--seed`.

No remaining open questions on this axis. Multi-key stratification
revisited in a follow-up if the proposer's per-tactic breakdown
shows blind spots.

### OQ3 — Cost target & sample-during-optimize default

You asked: how much should a full run on 937 rows cost to be
acceptable? I can't answer in absolute USD without quantifying first
(part of the de-risking step in Next Steps), but here's the rough
shape:

- **Proposer (Opus 4.7 xhigh)**: very expensive per call. Order of
  magnitude $0.10–$0.50 per propose call, maybe more depending on
  trajectory context size. ~30 propose calls in a typical GEPA run
  → ~$5–$20 just for proposer.

- **Judge (Nova Lite via `SYSTEM_QUEUE_FLAGGER_MODEL`)**: ~$0.001–
  $0.003 per evaluate call. With 700 train rows × 30 iterations =
  21,000 evaluate calls → ~$20–$60.

- **Total ballpark**: $25–$80 per full-fixture run with no sampling.

  Can we capture costs of the proposer calls in the optimizer reporter?

Two levers to bring this down:

- **`--sample N` during optimize.** Variance concern is real but
  mitigable with a fixed seed (every iteration sees the same N
  rows). Cuts judge cost roughly proportionally — `--sample 200`
  drops judge cost ~3.5× to ~$6–$18.
- **Tighten `--budget-time` and `--budget-tokens`.** Caps total spend
  hard at the cost of fewer iterations.

**Open**:
- (a) What's the cost ceiling per run that would be acceptable to
  you for routine prompt iteration?
  Let's find out. For now 25$ cap is acceptable.

- (b) Should `--sample` default to *on* (e.g. `--sample 200`) for the
  cheap-iteration loop, with `--sample 0` or `--full` to opt into
  the full set? Or default to *off* and require explicit `--sample`?
  My preference: **default off** for honesty (full-fixture is the
  honest measurement), but document `--sample 200` as the recommended
  cheap-iteration knob.
  Agree.

### OQ4 — Trajectory schema for flaggers (resolved)

`OptimizationTrajectory` requires
`{ id, conversationText (min 1), feedback, expectedPositive,
predictedPositive, passed, score, totalTokens }`. Decisions:

- **`passed` for flaggers** = `predictedPositive === expectedPositive`
  (equivalent to `score === 1`). Documented in
  `optimize/flagger/`. The eval flow's `passed` means something
  different ("judge said pass") — the schema is target-agnostic, the
  per-target gloss is fine.
- **Tactic tags + per-layer signals** travel inside the JSON-encoded
  `feedback` string (per OQ1). No schema extension. The
  file-as-candidate decision in S1 makes structured per-layer signal
  *required* in feedback (so the proposer knows whether the prompt
  layer or the pre-filter layer is the cause of a misclassification)
  — which is why `feedback` is now JSON.
- **Empty `conversationText`**: skip the row with a warning. Empty
  traces are pathological; not worth a schema change.

No remaining open questions.

### OQ5 — Progress UI for `benchmark:optimize`

Iteration table, updates per propose+evaluate pair. With
file-as-candidate (S1) each iteration produces a complete file diff;
the "Changed" column is a coarse summary of which top-level
declarations the proposer touched (computed by diffing the proposed
file's AST against the parent's):

```
Iter  Time     Changed                  Hash      Train F1  Val F1   Cost   Notes
  1   0:02:14  (baseline)               a1b2c3d4    0.812    0.798  $1.40
  2   0:08:31  JAILBREAK_SYSTEM_PROMPT  e5f6g7h8    0.815    0.804  $2.85   ⭐ new best (val)
  3   0:14:02  HIGH_PRECISION_…         i9j0k1l2    0.806    0.791  $4.20
  4   0:19:48  prompt + extractJailbreakSusp…  m3n4o5p6  0.821  0.812  $5.55  ⭐ new best (val)
  ...
Stagnation: 2/10  ·  Budget: 19m / 2h  ·  Tokens: 1.2M / 100M
```

Re-print the whole table on each update; iterations are sparse so
this is cheap. Listr2 isn't a great fit (per-row-shaped); render to
stdout directly.

Decisions on column-add questions you flagged:
- **Trajectory-summary cells** ("5 FN persona-aim"): not in the live
  table — too noisy. Goes in the MD report instead.
- **Candidate-hash column**: yes, short hash (8 chars) helps cross-ref
  with the audit JSON. Added.
- **Proposer `reasoning` streaming**: deferred behind a `--verbose`
  flag, not v1.

#### Maybe later — interactive per-iteration diff TUI

The "Changed" column is a coarse heuristic (top-level declaration
names only — misses edits inside method bodies). The MD report carries
the literal *baseline → winner* unified diff, which covers the routine
PR-review flow.

What's not covered: scrolling through *each iteration's* parent → child
diff to debug "why did F1 dip at iter 12?" or "did the optimizer ever
touch the regex layer?". Today that requires reading the audit JSON
manually.

A small post-run ink TUI would close that gap:

- Iteration list on the left (hash, train/val F1, cost), paginated diff
  on the right with red/green coloring, j/k to navigate.
- Reuses dependencies already in the package (`ink`, `react`, `diff`).
- ~1–2 hours of work; no schema change — the audit JSON already
  carries every candidate's full text per iteration, so the TUI is a
  backwards-compatible add against existing audits.

Skip for v1. Build the first time you actually want it for debugging
— the value is investigative, not routine, and pre-building it for
"someday" risks adding another surface to maintain that nobody opens.

No remaining open questions.

### OQ6 — Validation of proposed candidates (resolved)

GEPA proposes TypeScript file source (S1). Validation is in three
stages, each rejecting candidates that score 0 across the board so
GEPA's stagnation prunes them.

**Stage 1 — Static shape scan** (TS AST, no execution; runs **at
propose-time with up to 2 retries** before any evaluate call,
re-running the proposer with the failure reason as feedback. We
deliberately don't enumerate available imports in the system
prompt — see Safety guardrails in S1 for why):
- File parses as valid TS. No syntax errors.
- Every import specifier resolves from the strategy file's
  package context — workspace modules under `@domain/*`,
  `@repo/utils`, `@repo/observability`, relative paths inside
  `flagger-strategies/`, or any npm package already declared in
  `packages/domain/annotation-queues/package.json` (or
  transitively present in the resolved dep tree). Anything that
  doesn't resolve is rejected (the proposer's `reasoning` will
  often surface what was wanted; reviewer can decide whether to
  install).
- **Architectural denylist**: imports from `@platform/*`,
  `@apps/*` are rejected even if resolvable.
- **Dangerous-intrinsic denylist** (by name, regardless of import
  source): `process.*`, `child_process`, `fs`, `net`, `vm`,
  `eval`, `Function(...)` constructor, dynamic `import(...)`,
  `require(...)`, `globalThis.*` writes.
- Exports include `<queueSlug>Strategy` declared as a
  `QueueStrategy` (or compatible — checked structurally by walking
  to the object literal and confirming all 4 method names appear).

**Stage 2 — Compile + load** (esbuild, in-memory; happens once per
candidate, cached by hash for the whole iteration):
- esbuild transforms TS → ESM JS, bundling all workspace + npm
  imports inline. Compile error → reject.
- The bundled module is loaded via `import()` from a Blob URL
  (v1) directly in the parent process. Import error (missing dep
  surfaced at load time, etc.) → reject. **v2 swaps this for a
  worker-thread spawn** (see end of spec) without changing the
  external `loadFlaggerCandidate` API.
- The loaded module's exported strategy is probed for all 4
  expected methods as functions. Missing or non-function → reject.

**Stage 3 — Runtime guards** (during evaluate):
- 5s wall-clock async timeout per `detectDeterministically` /
  `buildSystemPrompt` / `buildPrompt` call via `Promise.race`.
  Timeout → that row scores 0 and the candidate accumulates
  timeouts; if > 5% of rows time out the candidate is rejected
  wholesale. **v1 caveat**: synchronous CPU loops (e.g.
  catastrophic regex backtracking) block the event loop and the
  timeout fires only after the loop finishes — process watchdog
  is the v1 fallback; v2 closes this gap with `worker.terminate()`.
- Any thrown error from a strategy method → that row scores 0,
  candidate keeps trying. If > 50% of rows throw, candidate
  rejected wholesale.

Length bounds aren't enforced explicitly; in practice the proposer
emits files in the same order of magnitude as the baseline (~10 KB),
and Stage 1's import-resolution check prevents huge files of ESM
noise.

If a candidate makes it to Stage 2 or 3 and is rejected there
(rather than recovered at propose-time retry), the trajectory
feedback for that candidate carries `phase: "candidate-rejected"`
plus a `rejection: { stage, reason }` field — so the next reflection
round sees *why* a candidate failed, not just that it scored 0.

No remaining open questions.


### OQ7 — Linking baseline file to prompt hash (deferred)

Currently `baselines/<target>.json` doesn't record which version of
the system prompt produced its numbers. After the optimizer lands, a
stale prompt edit that wasn't followed by `benchmark:run
--update-baseline` produces silently misleading baselines.

Decision: **deferred.** Git history is enough for v1. The "adopt
winner?" prompt now baked into the post-optimize workflow (see
Decisions: *Workflow after optimize*) covers your UX concern by
auto-running `benchmark:run --update-baseline` when the user accepts
— so the staleness window between "optimizer finished" and "baseline
reflects the new prompt" closes itself.

Revisit if stale-baseline confusion shows up in practice.

---

## Implementation notes

### Candidate loader (v1: direct dynamic import)

A target-agnostic module
`tools/ai-benchmarks/src/optimize/candidate-loader.ts` compiles a
TS-source candidate to a usable strategy instance, cached by hash.
v1 imports the bundled module directly in the parent process; v2
swaps the loader's body for a worker spawn without changing this
external API.

```ts
interface LoadedCandidate<Shape> {
  readonly shape: Shape                       // for flaggers: QueueStrategy
  readonly cleanup: () => Promise<void>       // no-op in v1; terminates worker in v2
}

const cache = new Map<string, Promise<LoadedCandidate<QueueStrategy>>>()
const blobUrls: string[] = []                 // for cleanup at run end

export const loadFlaggerCandidate = (input: {
  readonly hash: string
  readonly text: string                       // candidate's TS source
  readonly baselineImports: readonly string[] // for stage-1 scan
}): Promise<LoadedCandidate<QueueStrategy>> => {
  const existing = cache.get(input.hash)
  if (existing) return existing

  const loaded = (async () => {
    runStaticSafetyScan(input.text, input.baselineImports)     // throws on reject
    const js = await compileTsToEsmJs(input.text)              // esbuild, in-memory
    const blob = new Blob([js], { type: "application/javascript" })
    const url = URL.createObjectURL(blob)
    blobUrls.push(url)
    const mod = await import(url)
    const shape = probeQueueStrategyShape(mod)                 // throws if missing
    return {
      shape,
      cleanup: () => Promise.resolve(),                        // no-op in v1
    }
  })()

  cache.set(input.hash, loaded)
  return loaded
}

export const cleanupAllCandidates = () => {
  for (const url of blobUrls) URL.revokeObjectURL(url)
  blobUrls.length = 0
  cache.clear()
}
```

Each strategy method call from the evaluate path is wrapped in a 5s
`Promise.race` timeout. The timeout reliably fires for promise-based
hangs but does **not** interrupt synchronous CPU loops — the v1
caveat noted in S1's safety guardrails. A process-level watchdog
SIGKILLs the optimizer if a single iteration exceeds 10 minutes,
bounding the worst case.

Cache lifetime = the optimization run. After the run ends,
`cleanupAllCandidates` revokes Blob URLs to release the bundled JS.

### Capturing the audit trail

`Optimizer.optimize` returns only `{ optimizedCandidate }` — no
iteration history. To produce the audit JSON, the `evaluate` and
`propose` callbacks defined inside `benchmark:optimize` push records
to an in-memory trail as they fire, and we serialize at the end:

```ts
// inside benchmark:optimize
const auditTrail = {
  iterations: [] as IterationRecord[],
  candidates: new Map<string, CandidateRecord>(),  // keyed by candidate hash
}

const evaluate = async (input) => {
  const loaded = await loadFlaggerCandidate({
    hash: input.candidate.hash,
    text: input.candidate.text,
    baselineImports: baselineImportList,
  })
  const result = await runFlaggerOnRow({
    rowId: input.example.id,
    strategy: loaded.shape,    // passed via strategyOverride into classifyTraceForQueueUseCase
  })
  auditTrail.candidates
    .getOrInit(input.candidate.hash)
    .scores.push({ exampleId: input.example.id, score: result.score })
  return result
}

const propose = async (input) => {
  let lastError: string | null = null
  let lastProposed: ProposerResult | null = null

  for (let attempt = 0; attempt < MAX_PROPOSE_RETRIES; attempt++) {
    const proposed = await callFlaggerProposer({
      fileText: input.candidate.text,
      context: input.context,
      operatorNotes,                                // from --proposer-notes(-file), or null
      previousAttemptError: lastError,              // null on first attempt
    })
    lastProposed = proposed
    const scan = runStaticSafetyScan(proposed.text)
    if (scan.ok) {
      auditTrail.iterations.push({
        iteration: auditTrail.iterations.length + 1,
        parentHash: input.candidate.hash,
        childHash: proposed.hash,
        proposerReasoning: proposed.reasoning,
        proposerCost: proposed.cost,
        proposerAttempts: attempt + 1,
        changedDeclarations: diffTopLevelDecls(input.candidate.text, proposed.text),
        timestamp: Date.now(),
      })
      return proposed
    }
    lastError = scan.message
  }

  // All retries failed — let it through; evaluate scores 0 with rejection
  // reason carried in trajectory feedback for the next reflection round.
  auditTrail.iterations.push({
    iteration: auditTrail.iterations.length + 1,
    parentHash: input.candidate.hash,
    childHash: lastProposed!.hash,
    proposerReasoning: lastProposed!.reasoning,
    proposerCost: lastProposed!.cost,
    proposerAttempts: MAX_PROPOSE_RETRIES,
    rejection: { stage: "static-scan", reason: lastError! },
    timestamp: Date.now(),
  })
  return lastProposed!
}

const MAX_PROPOSE_RETRIES = 3   // 1 attempt + 2 retries
```

This is internal to `benchmark:optimize` (its own command per S2).
`benchmark:run` is unaffected. The `Optimizer` port stays
single-candidate; the eval flow's `evaluation-optimization-activities.ts`
is unchanged.

After `optimizer.optimize(...)` returns, we serialize `auditTrail`
to disk and run the cache cleanup.

---

## v2: Worker isolation (planned)

v1 ships **without** worker isolation per the discussion in S1's
safety guardrails: dev-only context, trusted Opus 4.7 proposer, static
scan covers the dangerous-API surface. v2 adds it to close the one
real gap v1 leaves open: **catastrophic regex backtracking and other
synchronous CPU runaways are not interruptible in v1** — the JS event
loop is blocked, async timeouts don't fire, and recovery is "dev hits
Ctrl-C". Worker isolation gives `worker.terminate()` as a hard kill
that V8 honors regardless of what the worker thread is doing.

### When to do v2

Trigger conditions (any one):

- A real-world v1 run hangs on regex backtracking and a dev has to
  Ctrl-C. One occurrence = anecdote; two = pattern; pattern = build
  v2.
- We extend the optimizer to a less-trusted context (different
  proposer model, CI integration, multi-user shared infra) — the
  threat model widens, defense-in-depth becomes worth the cost.
- Someone asks for it on cost grounds — e.g. running optimizations
  on a CI box where SIGKILL recovery is more disruptive than on a
  laptop.

Without one of these, v1 is fine indefinitely.

### Estimated effort

**~1 day of focused implementation work, ~1.5 if surprises hit.** The
implementation is mostly mechanical because v1 has already proven the
hard parts (esbuild bundling, workspace import resolution, candidate
caching). v2 just swaps the loader's body.

### Implementation checklist

**Plumbing**:

- [ ] `optimize/candidate-worker.ts` — worker entry file. Imports the
      esbuild-bundled candidate module on spawn (passed in via
      `workerData` as a tmp-file path), exposes its `QueueStrategy`
      methods via `parentPort` request/response RPC. Each request
      carries `{ id, method, args }`; each response
      `{ id, result | error }`.
- [ ] Update `loadFlaggerCandidate` to spawn a `worker_threads.Worker`
      via the new entry file instead of doing parent-process dynamic
      import. The external `LoadedCandidate.shape` API stays the same
      — methods become async proxies that send messages and await
      responses.
- [ ] Per-call timeout: `Promise.race` between the RPC response and
      a 5s timer; on timeout, `worker.terminate()` and resolve to a
      score-0 outcome. **This is the v2-only behavior**: `terminate()`
      hard-kills the worker even mid-CPU-loop, which the v1 timeout
      could not.
- [ ] Cache invalidation: any candidate whose worker terminated for
      timeout/crash is removed from the cache; further evaluate calls
      for that candidate are no-ops returning score 0 (treat as broken
      candidate, let GEPA stagnation prune it).
- [ ] Worker error semantics: map "worker exited" / "uncaught
      exception in worker" / "RPC timeout" / "thrown from method"
      into clean audit-trail entries with distinct rejection reasons.
- [ ] Tmp-file lifecycle: bundled JS is written to a per-candidate
      tmp path before worker spawn; cleaned up on worker terminate or
      run end.

**Tests**:

- [ ] Integration test: a candidate with a deliberately-pathological
      regex `/(a+)+$/` evaluating against `"a".repeat(40) + "!"` is
      killed by `terminate()` within ~5s and scores 0. **This is the
      test that proves v2 actually does what v1 didn't.**
- [ ] Integration test: a candidate that throws synchronously inside
      `detectDeterministically` produces a score-0 outcome with a
      `rejection: { stage: "runtime", reason: <message> }` field on
      the trajectory.
- [ ] Integration test: a candidate that imports a module with side
      effects (e.g. opens a connection or starts a timer on load)
      still spawns cleanly — the worker boundary contains it; cleanup
      terminates the worker without orphan handles in the parent.

**Risk factors to plan for** (each adds <½ day if hit; mitigate
before starting):

- **`TraceDetail` cross-boundary serialization.** Node's
  `postMessage` uses the structured-clone algorithm — handles
  primitives, plain objects, dates, arrays, typed arrays. If
  `TraceDetail` (as produced by `runner/adapter.ts`
  `fixtureRowToTraceDetail`) carries class instances, symbols, or
  functions, you'll need a custom encode/decode pass. **Pre-flight
  check**: before starting v2, dump a sample `TraceDetail` and
  attempt `structuredClone(traceDetail)` in a test — if it round-
  trips cleanly, no custom serializer needed.
- **Effect interop.** Strategy methods today are synchronous; the
  evaluate callback wraps them in Effect via `Effect.tryPromise` or
  similar. The v2 worker-proxy methods are async by necessity, but
  this is already the v1 shape (`Promise.race` for timeouts), so the
  Effect wrapping doesn't change.
- **Esbuild → bundle delivery to worker.** Two viable paths:
  (a) write bundled JS to a per-candidate tmp file, worker imports
  the path; (b) pass the bundled JS as a string via `workerData`,
  worker uses `eval()` or a dynamic-import-from-Blob trick. **Pick
  (a).** Tmp file is simpler, easier to debug (you can inspect the
  bundled candidate on disk), and avoids `eval()` in the worker.
  Cleanup is `fs.unlink` after `worker.terminate()`.

### Migration shape

The seam is `loadFlaggerCandidate(input) → LoadedCandidate<QueueStrategy>`
in `optimize/candidate-loader.ts`. v1 implements this with direct
dynamic import + Blob URL. v2 swaps the body for worker spawn + RPC
proxy. Callers of `loadFlaggerCandidate` see no change — they get a
`QueueStrategy`-shaped object whose method calls happen across the
worker boundary in v2 instead of in-process.

A `--no-worker-isolation` flag preserves the v1 path during v2
rollout so anyone hitting unexpected v2 behavior can fall back. After
v2 has baked for a few weeks, the flag and the v1 loader code path
can be removed.
