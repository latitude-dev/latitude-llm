# Cost dashboard

Project-scoped spend analytics in the web app (`/projects/$projectSlug/cost`). The page answers how much a project spent, where it went, whether the figures are trustworthy, and what moved average cost per session — all from ClickHouse span aggregates, not a separate warehouse.

Gated by the per-organization `costDashboard` feature flag (see [feature flags](./feature-flags.md)). With the flag off, the route renders a short unavailable message.

## Data path

```
apps/web (cost page)
  → cost.functions.ts (TanStack Start server fns)
    → CostAnalyticsRepository (@domain/spans port)
      → cost-analytics-repository.ts (@platform/db-clickhouse)
        → spans table (ClickHouse)
```

Costs are **microcents** throughout the stack (`1 USD = 100_000_000 microcents`). The UI owns rounding and currency display.

Every figure is scoped to **billable spans** — the same `operation` allowlist the traces and sessions rollups use (`USAGE_OPERATIONS_SQL`). Wrapper and tool spans are excluded so per-trace averages are not diluted and spend is not double-counted.

Pricing confidence is reconciled server-side against the model registry (`@domain/models`): verified provider-reported cost, estimated cost from token counts × registry price, genuinely free models, and unpriced gaps (unknown model strings with billable tokens but no price list). The header badge surfaces this as **priced coverage** so the UI never has to guess whether a zero-cost row is a gap or a free tier.

Span-level cost ingestion and `costSource` semantics live in [spans](./spans.md). Cache token classification and TTL detection live in [prompt-cache TTL detection](./prompt-cache-ttl-detection.md).

## Page layout

The time picker drives one shared window (`fromIso` inclusive, `toIso` exclusive) for every panel so KPIs and charts reconcile. Unlike other analytics pages, an unset range defaults to **recent activity**, not all time — every figure is clamped to a recent slice.

| Section | Component | What it shows |
| --- | --- | --- |
| Overview | `CostKpiRow` + `CostOverTimePanel` | Total spend, traces with usage, daily average, top-spend model; time series with `total` / `average` / `p95` metric toggle and per-model stacking on `total` |
| Session | `CostPerSessionPanel` | Log-space decomposition of why average cost per session moved between the selected window and the prior window of equal length |
| Model | `ModelUsagePanel` | Stacked time series per model with cost / tokens / calls measure toggle |
| Model | `ModelImpactPanel` | Model-ranked spend with drill-through to filtered sessions |
| Cache | `CacheEconomicsPanel` | Cache read/write token flow, achievable ceiling from measured arrival cadence, break-even judged against registry cache lifetimes |
| Breakdown | `CostBreakdownPanel` | Dimension table (`model`, `provider`, `operation`, `service`) with share-of-window columns |

Bucket width (`pickCostBucketSeconds`) adapts to the selected range. Incomplete trailing buckets are marked provisional so partial intervals are not read as full periods.

## Cost per session decomposition

`decomposeCostPerSession` (`packages/domain/spans/src/helpers/decompose-cost-per-session.ts`) explains a before/after change in average cost per session as a product of multipliers:

`traces/session × calls/trace × tokens/call × modelMix × tokenMix × promptRate × outputRate`

Each factor's own period-over-period ratio is a multiplier; the multipliers multiply to the headline cost-per-session ratio exactly. The price side splits four ways so a blended per-token price moving because of routing (dearer model) or token shape (more prompt, same output) does not masquerade as a rate change.

Guardrails:

- **`SESSION_COST_MIN_SESSIONS` (20)** — below this, one expensive session dominates the average and the decomposition is withheld.
- **`SESSION_COST_QUIET_BAND` (0.05)** — multipliers within ±5% of 1 render as unchanged.

The repository returns both windows' factor inputs in one scan (`getSessionCostFactors`) so the comparison cannot disagree about filters.

## Query surface

Server functions in `apps/web/src/domains/cost/cost.functions.ts` wrap the repository port:

| Function | Repository method |
| --- | --- |
| `getCostOverview` | `getCostOverview` |
| `getCostSeries` | `getCostSeries` |
| `getCostBreakdown` | `getCostBreakdown` |
| `getModelUsageSeries` | `getModelUsageSeries` |
| `getCacheEconomics` | `getCacheEconomics` |
| `getCostPerSessionDecomposition` | `getSessionCostFactors` → `decomposeCostPerSession` |

React Query hooks live in `cost.collection.ts` with a 30s stale time. Breakdown queries intentionally omit `placeholderData` — dimension labels must match the fetched dimension, so holding the previous result would show model rows under a Provider heading during refetch.

## Limits and caps

| Constant | Value | Purpose |
| --- | --- | --- |
| `COST_BREAKDOWN_ROW_LIMIT` | 25 | Breakdown table row cap; `distinctValues` reports truncated tail |
| `SERIES_MODEL_LIMIT` | 8 | Models beyond top spend collapse to "Other models" in the time-series chart |
| `ZERO_COST_PAIR_LIMIT` | 50 | Unpriced provider/model pairs listed in the confidence disclosure |
| `CACHE_ECONOMICS_ROW_LIMIT` | 25 | Cache economics model list cap |

## Enabling

1. Add or confirm `costDashboard` in `packages/domain/feature-flags/src/registry.ts`.
2. Enable the flag for the target organization (or globally) in `/backoffice/feature-flags/`.
3. The Cost nav item and `/cost` route appear on the next `featureFlags` collection refresh.

No deploy is required beyond the flag row — the UI and server functions ship behind the gate.
