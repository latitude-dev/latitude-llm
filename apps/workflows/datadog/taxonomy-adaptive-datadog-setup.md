# Taxonomy adaptive clustering — Datadog setup

Each garden run of an organization with the `adaptiveTaxonomyClustering` flag on
emits its diagnostics as attributes on the APM span
`taxonomy.gardenTaxonomyWorkflow.shadow` (service `workflows`). Application logs
go to CloudWatch, not Datadog, so the read path is APM spans. Do these **before**
enabling the flag for an organization, since retention filters and span metrics
are not retroactive.

The span keeps its shadow-era name deliberately: the retention filter, the
span-based metrics, and the dashboard widgets all key on the span name, so a
rename orphans three objects at once and silently empties the dashboard. In
Datadog that name lands in **`resource_name`**, not `operation_name` — every query
below and in the script filters on `resource_name`.

Site: `datadoghq.eu`. All calls need `DD-API-KEY` + `DD-APPLICATION-KEY` headers,
and the keys' role must carry the RBAC permissions for each write: the retention
filter needs `apm_retention_filter_write`, the span metrics need
`apm_generate_metrics`. A key without them returns 403.

`setup-datadog.sh` also converges the tree-quality objects (the `.buildQuality` /
`.nameQuality` spans, which are **not** flag-gated) — see
[taxonomy-quality-datadog-setup.md](./taxonomy-quality-datadog-setup.md). One run
of the script sets up both.

## Gate 1 — ingestion (mostly handled in code)

The OTel SDK samples AlwaysOn, so the app exports 100% of spans to the DD agent.
The activity also sets `manual.keep` on the span, which tells the trace agent to
keep the low-volume garden trace chunk at ingestion. If agent-side sampling still
drops them, pin ingestion with an Ingestion Control rule (APM → Settings →
Ingestion Controls) keeping `service:workflows` at 100%.

## Gate 2 — retention filter (indexes ingested spans for 15 days)

`setup-datadog.sh` creates a 100%-keep retention filter over
`resource_name:taxonomy.gardenTaxonomyWorkflow.shadow`
(`POST .../apm/config/retention-filters`; exact body in the script). It keeps
100% of the garden spans, searchable/aggregatable in Trace Explorer and the
spans-source dashboard for 15 days.

Retention filters are evaluated **top-down**, and the first match makes the
keep/drop decision — a broader filter above this one could sample the garden
spans out before it runs. `setup-datadog.sh` asserts the order itself, promoting every
taxonomy filter above the rest on each run, so this is not a manual step. It has to be
re-asserted every run: recreating a filter by name gives it a new id at the bottom of
the order.

## Durable history — span-based metrics (retained 15 months)

Indexed spans expire after 15 days, so `setup-datadog.sh` also generates
span-based metrics (`POST .../apm/config/metrics`) for durable, cheap aggregation:
distributions (percentiles) of the build durations, the RSS sample, and
relative-separation p50, plus a `count` metric for fallbacks — all grouped by
`@taxonomy.projectId` / `@taxonomy.organizationId` / `@taxonomy.customBehaviorId`.
The exact metric list and payloads live in the script (the single source of
truth), so the dashboard can read `data_source: metrics` for history beyond the
15-day span window.

## Interpreting the dashboard

Every widget reads the `taxonomy.gardenTaxonomyWorkflow.shadow` span; one span
per garden run per project, describing the tree that run **actually persisted**.
A run only emits the span when adaptive was selected — an organization without the
flag builds static and emits nothing here.

The tree is a hidden depth-0 root over `rootChildCount` top-level clusters. The
bug adaptive fixes is that the fixed 0.85 sibling-cosine gate collapsed some
projects to ~1 root child; the node-relative gate recovers the real intents.

| Metric (attribute) | What it is | Good | Bad / watch |
| --- | --- | --- | --- |
| `relativeSeparation.p50` (+ p10/p90) | How far accepted splits clear the node-relative gate (threshold 0.45 at root → 0.65 deep) | Comfortably **above** the depth threshold — accepted splits are genuinely separated | Hugging the threshold → marginal, fragile splits a small schedule change would flip |
| `rejectionReason.*` counts (undersizedChild / dominantChild / lowScore / lowRelativeSeparation) | Why candidate splits were rejected — the "explain every collapse" layer | Mixed/low; a collapse is explainable by the reason that dominates | `lowRelativeSeparation` dominating a project you *expect* to split → the separation gate is the binding constraint (possibly too strict); `dominantChild` → one child hogging the parent |
| `adaptiveDurationMs` | Build wall-clock. **Read it against `escalated`**, not on its own: a near-gate root re-search deliberately costs ~2.4× a plain adaptive build | Comfortably under `TAXONOMY_CLUSTERING_WORKER_TIMEOUT_MS` (300s) on both `escalated:0` and `escalated:1` runs | A `durationMs` sitting at ~300,000 with `fallbackReason:buildError` → the build is being killed by the worker deadline (failed builds report the time they burned, so a deadline kill is visible as a duration AT the deadline rather than as a zero) |
| `staticDurationMs` | Wall-clock of the static build, which runs **only** when static is the tree being persisted — i.e. a fallback run | `0` on a healthy adaptive run | Non-zero → this run fell back; read `fallbackReason` |
| `escalated` / `escalationSkipped` | Whether the root landed in the re-search band, and whether the projected work budget declined it | `escalated:1` on narrow projects that need it; `escalationSkipped:0` | `escalationSkipped:1` recurring → `TAXONOMY_ADAPTIVE_ESCALATION_MAX_WORK` is too tight for that corpus. Adaptive still publishes, but from the un-escalated first pass, which on a near-gate corpus is the collapse-prone tree the re-search exists to avoid. Compare `projectedRootSearchWork` against the budget |
| `bestRootSeparation` | Best separation any ROOT candidate reached, accepted or not | Above the 0.45 root gate, or well below 0.25 on genuinely unimodal projects | Sitting inside the [0.25, 0.8) band every run → that project re-searches on every pass and pays for it |
| `buildError` | Message behind a `fallbackReason:buildError` | `none` | A timeout message → the build is exceeding the worker deadline; anything else is a builder fault |
| `peakRssBytes` (max) | **A single process-wide RSS sample taken at plan time, despite the name — not a per-build high-water mark.** Worker threads share the process, so a heavy build is usually reflected, but a spike that ends before the sample is invisible. Read it as a floor on memory pressure | Comfortably **under** the worker limit (512 MB old-gen heap) | Approaching it → OOM risk, which itself trips a `buildError` fallback. A value that looks safe does not prove the build stayed there |
| `fallbacks` (`fallbackReason:*` count) | Runs that fell back to static: `nonFinite` / `structuralLimit` / `buildError` | **0** | Any. `nonFinite`/`structuralLimit` = a builder correctness bug; frequent `buildError` = worker instability. This is the primary rollout health gate |
| `nodeCount` / `leafCount` / `maxDepth` | Shape of the persisted tree | Stable per project across runs | Oscillating run-to-run → instability; a sudden collapse toward 1 root child → read `rejectionReason` |
| `observationsSampled` | Sample size feeding the build (min 15, cap 1,500) | Context only | Near 15 → thin sample; treat that project's row with lower confidence |
| `mode`, `policyVersion` | Slicing dimensions | `mode` = `enforced` on every span here; `policyVersion` separates calibrations | No `off` rows can appear — an off run emits no span at all |

## Why a project's trend needs ~2 weeks

Garden sweeps run every ~6h, but each run clusters a sample drawn from the
**trailing 7-day** window, so consecutive runs share almost their entire input
and are highly correlated — a dozen runs in a day is close to one independent
data point, not a dozen. So when judging whether a project's tree is *stable*,
read the trend, not a run:

- **~1 week (minimum)** for the 7-day window to fully turn over, so a later run
  is a genuinely fresh sample rather than a re-clustering of the same traces.
- **~2 weeks** to confirm the shape holds across **more than one turnover** —
  i.e. it is stable, not an artifact of one week's traffic mix.

Fallbacks and duration are the exception: they are per-run health signals and are
readable as soon as the first spans land (~6–11h after the flag flip).

## Order of operations

1. Run `setup-datadog.sh` (retention filter + span metrics), then reorder the
   filter to the top per Gate 2.
2. Apply `taxonomy-adaptive-rollout-dashboard.json` with `upsert_datadog_dashboard`.
3. Enable `adaptiveTaxonomyClustering` for the target organizations (or
   `enabled_for_all` for the fleet). The flag is the only gate — there is no env
   override, so turning it off is also how you kill the rollout.
4. Trigger a garden run (or wait ~6h) → confirm spans via Trace Explorer:
   `service:workflows resource_name:taxonomy.gardenTaxonomyWorkflow.shadow`.
5. Watch `fallbacks` first. To revert an organization, unset its flag: the next
   garden pass rebuilds that project's tree with the static builder, with no
   manual cleanup.
