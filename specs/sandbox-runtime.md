# Sandbox runtime

> **Documentation**: eventual durable home `dev-docs/sandbox-runtime.md`; updates `dev-docs/evaluations.md` (Runtime Architecture section). Related: `specs/signals.md` — the signals spec **depends on this one**: every signal detector type (evaluation, rule, script; semantic excepted) executes through the runtime defined here. This ships first.
>
> **Closes**: the `TODO(eval-sandbox)` in `packages/domain/evaluations/src/runtime/evaluation-execution.ts`.

## Purpose

Latitude stores evaluations as JavaScript source text, but **no JavaScript actually executes today**: `executeEvaluationScript` accepts only the rigid LLM-as-judge template (`wrapPromptAsEvaluationScript`), *extracts the prompt back out of the script text*, and calls the model directly. Every evaluation is therefore constrained to one template, and the upcoming signal detectors (code rules, raw user scripts) have no execution substrate at all.

This spec defines the real **sandbox runtime**: a portable, host-controlled, resource-limited JavaScript sandbox that

1. replaces the template-extraction MVP for evaluations (no storage migration — stored scripts already match the intended contract), and
2. becomes the single execution substrate for signal detectors (`specs/signals.md`), the detector dry-run/test harness, and the simulation CLI.

## The execution contract

One score-shaped contract for every detector. The script reports a **value**; the **host** derives membership from the signal's threshold. There are no dialects — what differs between judgment-bearing detectors and bare-membership detectors is only the persistence policy below.

### Output: one score, host-derived membership

```ts
// Script return type
Score(value: number, feedback?: string)   // value ∈ [0, 1]
Passed(value?, feedback)                  // sugar → Score(value ?? 1, feedback)
Failed(value?, feedback)                  // sugar → Score(value ?? 0, feedback)

// Host-side result
type RunResult = {
  value: number        // signal-exhibition strength ∈ [0, 1]
  feedback?: string    // judge-grade detectors only; optional (its clustering
                       //   consumer died with issue discovery)
  duration: number     // ns, wall time of the run including host calls
  tokens: number       // total tokens consumed by llm() calls (0 for pure runs)
  cost: number         // microcents consumed by llm() calls (0 for pure runs)
}

// The script never decides membership — the host does:
matched = result.value >= signal.threshold
```

- **`value` is signal-exhibition strength, never goodness**: "how strongly does this trace exhibit *this signal*" — for moments and failure modes alike. Generated judges are phrased *as the signal* ("does this trace exhibit X?") so judge-yes = high value, and polarity disappears from the contract. Legacy quality-phrased evaluation scripts (where *fail* = exhibits) migrate by value inversion (`1 − value`) or regeneration — that migration belongs to the signals rollout, not to this spec's executor swap.
- **`threshold` is a per-signal knob** (`signals.threshold`, default `0.5`) — the semantic detector's `minSimilarity` generalized to every type. Rules emit a degenerate 0/1; semantic emits similarity (genuinely continuous); judges emit ≈{0,1} (binary LLM judgments are better calibrated than continuous scoring — the UX must not render judge values as confidence); scripts emit whatever they compute. Threshold edits apply forward only, like every definition edit.
- Membership is monotone per (signal, trace) downstream — a later below-threshold run never un-matches (occurrence dedup is first-match-wins), which makes non-deterministic `llm()` detectors safe by construction.

### Persistence policy (separate from the contract)

A score-shaped *result* is not a persisted score *row*. Persist a score only when the run produced information that **cannot be recomputed** — an LLM judgment (non-deterministic, costed) or a human annotation (irreplaceable). Pure runs are deterministic functions of `(definition, trace)`: a score row would duplicate the occurrence at the highest volume tier, and match-rate denominators are computable at read time (the scope `FilterSet` over the traces table).

| Run | Persists |
| --- | --- |
| pure detector, `value ≥ threshold` | occurrence row only (with denormalized `value`) |
| pure detector, below threshold | nothing |
| `llm`-capability detector (evaluations included) | score row (value, feedback) via the canonical path, + occurrence when matched |
| annotation linked to a signal | score row as today, + occurrence |

The policy is capability-driven, not type-driven: a raw script that calls `llm()` persists scores; a pure script doesn't. Flipping a row of this table later is a policy change, not a migration.

### Script globals (host-controlled, nothing else in scope)

Per the contract already documented in `dev-docs/evaluations.md`:

| Global | Capability | Notes |
| --- | --- | --- |
| `conversation` | — | Read-only message view (`{ role, content }[]`, today's `toEvaluationConversationMessages` shape; grows a richer trace view — tool calls, metadata, metrics — for detectors) |
| `issue` / `signal` | — | `{ name, description }` context of the owning entity |
| `z` | — | Zod, for schemas passed to `llm()` and `parse()` |
| `parse(value, schema)` | — | Validates an unknown value against a schema |
| `llm(prompt, { schema })` | `llm` | Structured generation through the host (`@domain/ai`); the schema is required — schema-less calls throw in-sandbox; model/provider stay host-managed (`EVALUATION_SCRIPT_RUNTIME_MODEL`); remaining options are host-approved only |
| `Score(value, feedback?)` | — | The single return type |
| `Passed(value?, feedback)` / `Failed(value?, feedback)` | — | Sugar over `Score` (`value ?? 1` / `value ?? 0`); keeps stored templates valid |

No ambient I/O: no `fetch`, no timers, no `process`, no dynamic import. Anything a script can *do* beyond pure computation is an explicit host function.

### Compatibility and the semantic exception

- **Existing evaluation templates run unchanged**: the stored template *is* `const result = await llm(\`…\`, { schema: z.object({ passed, feedback }) }); return result.passed ? Passed(1, …) : Failed(0, …)` — with `Passed`/`Failed` as sugar over `Score`, execution under the new runtime is byte-compatible. The exhibition-polarity migration of legacy scripts happens later, at the signals rollout.
- **Compiled rules** — `SignalRule` → generated script returning `Score(1)` / `Score(0)`; the compiled text + content hash are stored, debuggable, and exactly what executes.
- **Semantic detectors do not run here** — they are a native batch runner producing the same `RunResult` shape (`value` = similarity, thresholded by the same per-signal knob): one pass over a trace's chunk embeddings against all anchor sets; per-signal script execution would destroy the batching for zero expressiveness gain. The one principled exception to "everything is a script".

### Capabilities drive runtime decisions — never the script's origin

Each artifact carries a **capability set**, derived at compile time for generated scripts (rule → `pure`; evaluation template → `llm`) and detected statically for raw scripts (presence of `llm` references; overridable by explicit declaration). Capabilities decide:

| | `pure` | `llm` |
| --- | --- | --- |
| Execution lane | inline, synchronous, bounded ms | queued, asynchronous, seconds |
| Metering | CPU/memory only | + token & cost budgets per owner |
| Sampling default | 100% | configurable, plan-gated |
| Backfill | eligible by default | explicit, costed operation |
| Retry on transient failure | no (deterministic) | yes (host-call errors only) |

## Sandbox technology

Requirements, in priority order:

1. **Isolation** — multi-tenant user-authored code; the sandbox is a security boundary, not a convenience.
2. **Resource limits** — per-run instruction/CPU budget, memory cap, wall-clock timeout. This also neutralizes the classic detector footguns (catastrophic regex backtracking, accidental infinite loops): a runaway script burns its own budget, not a worker.
3. **Portability** — the same runtime must run in backend workers and the simulation CLI (a `dev-docs/evaluations.md` invariant).
4. **Async host calls** — `llm()` suspends the script while the host performs the call.

**Decision: QuickJS compiled to WASM** (`quickjs-emscripten`). The WASM boundary provides isolation and deterministic interrupt-based CPU limits, memory is capped per context, it runs identically in Node and anywhere else WASM runs, and host functions are bridged explicitly. Script bytecode is precompiled and cached keyed by the script's content hash (the same hash stored as artifact provenance).

Rejected:

- **`AsyncFunction` / `node:vm`** (the v1 approach): not a security boundary — same-process, same-heap, escapable. Acceptable for Latitude-authored templates only, disqualifying for user scripts.
- **`isolated-vm`** (V8 isolates): strong isolation but Node-native (build/ABI pain across platforms) and not portable to non-Node hosts.
- **Worker-process pool with OS sandboxing**: strongest isolation, heaviest ops burden, not portable, latency floor too high for the inline lane.

Performance note: QuickJS-WASM is ~10–50× slower than V8 — irrelevant here. Pure detectors do milliseconds of string work per trace; `llm` runs are dominated by the model call.

## Architecture

Ports and adapters per repo conventions:

- **`@domain/sandbox`** — the port and contract: `ScriptRuntime` interface (`compile(source) → CompiledScript`, `run(compiled, ctx, limits) → RunResult`), the `Score` contract types, capability detection, error taxonomy, and named-constant default limits.
- **`@platform/sandbox-quickjs`** — the adapter: QuickJS-WASM embedding, context pooling, bytecode cache, interrupt-based limits, host-function bridging.
- **Callers inject capabilities**: the evaluation executor passes an `llm` implementation backed by `@domain/ai` exactly as `executeEvaluationScriptWithAI` wires `generateStructuredObject` today, keeping model/provider/system-prompt host-managed and metering (`tokens`, `cost`, `duration`) flowing back through `RunResult` in the same units as `evaluationExecutionResultSchema`.

### Error taxonomy

Distinct `Data.TaggedError` classes in `@domain/sandbox` (per the effect-and-errors conventions):

| Error | Meaning | Downstream behavior |
| --- | --- | --- |
| `ScriptCompileError` | source does not compile | reject at save time — never at run time (compile on save) |
| `ScriptRuntimeError` | script threw | errored run; for evaluations → errored score (`error != null`), as today |
| `ScriptLimitExceededError` | CPU/memory/wall budget exhausted | errored run; counted against detector health |
| `HostCallError` | `llm()`/host failure | transient; retried per capability policy before becoming an errored run |

**A failed run is a silent false negative** (no occurrence, no score) — so runs and errors are counted per owner (evaluation or signal) and surfaced as **detector health** ("failing N% of runs") with a degradation notification. This observability is part of the runtime contract, not an afterthought: it ships with the runtime, because the evaluations path needs it just as much as detectors will.

### Dry-run harness

`run()` against an arbitrary historical trace is a first-class entry point, not a fork of production code. It powers, with one code path: the evaluation/detector **preview** in builders, "test this script against trace X", fixture-based regression tests for detectors, and agent/MCP authoring loops (write → run on samples → tighten).

## Migration: evaluations first

The swap is deliberately boring:

1. Stored scripts are untouched (they already match the contract — `validateEvaluationScript` keeps validating the template at save time for now).
2. `executeEvaluationScript` stops extracting the prompt and instead compiles + runs the script in the sandbox; `llm()` reproduces today's call exactly (`EVALUATION_SCRIPT_RUNTIME_MODEL`, `EVALUATION_SCRIPT_RUNTIME_SYSTEM_PROMPT`, structured-object schema from the script's own `z.object`).
3. Behavior parity is testable: for every stored template script, old path and new path must produce the same llm request and the same `EvaluationExecutionResultPayload`.
4. The swap rides a feature flag; once stable, the template-only constraint can be lifted (non-template evaluation scripts become legal), and signal detectors land on an already-proven runtime.

## Security

- Host-approved globals only; no ambient I/O, network, timers, or imports.
- Per-run limits (instructions, memory, wall clock) + per-project concurrency caps; all limits are named constants in `@domain/sandbox`.
- Trace content never leaves the tenant boundary except through `llm()` to the host-configured provider.
- Prompt injection against `llm()` judges is a known boundary: conversation content is adversarial input to the judge prompt. The host-owned system prompt and schema-constrained output are the mitigations; pure detectors are immune by construction.

## Testing

- **Unit (pure)**: contract conformance — `Score`/sugar mapping, threshold-derived membership, capability detection, limit enforcement (instruction/memory/wall), error taxonomy, determinism of pure runs, bytecode-cache correctness.
- **Parity**: every seeded/stored template script through old and new executors; identical llm requests and results.
- **Adversarial**: infinite loops, memory bombs, catastrophic regexes, prototype-pollution attempts, host-function abuse — each must die by budget or boundary, never by worker.

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 0 - Runtime package

- [x] **P0-1**: `@domain/sandbox` — `ScriptRuntime` port, `Score` contract types, capability model, error taxonomy, default limits as named constants.
- [x] **P0-2**: `@platform/sandbox-quickjs` — QuickJS-WASM adapter with context pooling, bytecode cache, interrupt limits, host-function bridge; adversarial test suite.
  - Implementation notes: the WASM module is the shared/reused unit while every run gets a fresh runtime+context (reusing contexts across tenant runs would leak prototype mutations across the isolation boundary), and `quickjs-emscripten`'s high-level API does not expose bytecode serialization, so the compile cache is keyed by source content hash over compile-only validation rather than persisted bytecode.

**Exit gate**: a raw script with `llm()` runs end-to-end under limits in a worker and in a plain Node CLI context, with metering in `RunResult`.

### Phase 1 - Evaluations on the runtime

- [x] **P1-1**: swap `executeEvaluationScript` to sandbox execution behind a feature flag (`evaluation-sandbox-runtime`); parity test suite green; errored-run accounting wired to existing errored-score semantics.
- [x] **P1-2**: detector-health counters (runs/errors per owner) + degradation surfacing.

**Exit gate**: flag on in staging; evaluations byte-compatible; template constraint ready to lift.

### Phase 2 - Detector enablement (pre-signals)

- [ ] **P2-1**: threshold-derived membership wiring + `SignalRule` → script codegen with stored compiled text + hash.
- [ ] **P2-2**: dry-run harness entry point (run against a historical trace) consumed by a minimal preview surface.

**Exit gate**: `specs/signals.md` flows A/F can be built against the runtime with no further runtime work.
