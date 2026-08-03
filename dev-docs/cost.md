# Cost analytics

Project-scoped spend analytics: window totals, spend over time, dimensional breakdown, model usage, cache economics, and a data-confidence strip that states how much of the window's usage Latitude could price.

The product surface lives at `/projects/:projectSlug/cost` behind the `costDashboard` feature flag (`packages/domain/feature-flags/src/registry.ts`). Domain port: `CostAnalyticsRepository` in `@domain/spans`; ClickHouse adapter: `@platform/db-clickhouse`.

See also: [`spans.md`](./spans.md) (ingest-time pricing and `costSource`), [`prompt-cache-ttl-detection.md`](./prompt-cache-ttl-detection.md) (why cache TTL for achievable-ceiling work is a hardcoded table), [`billing.md`](./billing.md) (Latitude credit metering — separate from customer LLM spend shown here).

## Units and scope

- **Costs are microcents** throughout the stack (`1 USD = 100,000,000 microcents`). The UI owns rounding; repositories return raw integers.
- **Billable spans only** — every query filters to the same operation allowlist the traces/sessions rollups use. Wrapper and tool spans never dilute per-trace averages or double-count spend.
- **Time window** — `from` is inclusive on `start_time`, `to` is exclusive. The page shares the project analytics time picker (`useAnalyticsTimeWindow`).
- **Per-trace denominators** — `tracesWithUsage` counts traces with at least one billable span, so traces made entirely of non-billable spans cannot deflate averages.

## Architecture

```
apps/web (cost page + server fns in domains/cost/)
   │  classifyCacheState, summarizeUnpricedUsage, modelCacheBreakEvenRate
   ▼
@domain/spans — CostAnalyticsRepository port, cache-economics helpers, classify-unpriced-cost
   ▼
@platform/db-clickhouse — CostAnalyticsRepositoryLive (spans table aggregates)
```

Server functions (`apps/web/src/domains/cost/cost.functions.ts`) resolve org scope, run Effect programs through `withScopedClickHouse`, and serialize `Date` fields to ISO strings for the client. `modelCacheBreakEvenRate` is resolved server-side because the browser entry cannot reach the pricing registry.

## Page sections

| Section | Server fn | Purpose |
| --- | --- | --- |
| KPI row + confidence strip | `getCostOverview` | Window total, traces with usage, average per trace, top-spend model, priced-coverage figures |
| Spend over time | `getCostSeries` | `total` (stackable by model), `average`, or `p95` per-trace cost per bucket |
| Cost breakdown | `getCostBreakdown` | One dimension (`model`, `provider`, `operation`, `service`) with share-of-total columns |
| Model usage over time | `getModelUsageSeries` | Cost or token volume per model per bucket; legend ranked by spend |
| Cache economics | `getCacheEconomics` | Per-model cache token flow, measured hit rate, break-even rate, classifier verdict |

Series requests carry `bucketSeconds` and are capped at `MAX_SERIES_BUCKETS` (1,000 aligned positions) so wide windows cannot ask for unbounded buckets.

## Data confidence

Each span stores `costSource` at ingest (`provider_reported`, `estimated`, `unpriced`, `unknown`, `no_tokens`). The confidence strip reads the window aggregate, not inferred zeros:

| Field | Meaning |
| --- | --- |
| `verifiedMicrocents` / `estimatedMicrocents` | How spend was priced (provider-reported vs Latitude registry estimate). In practice almost everything is estimated; the split states method, not a moving quality bar. |
| `pricedCoverage` | Share of billable tokens with a non-gap price, **including correctly free models**. This is the headline precision figure. |
| `gapTokens` / `gapCalls` | Usage ingestion marked `unpriced` — spend the window understates. |
| `unknownTokens` / `unknownCalls` | Zero-cost rows stored before `costSource` existed; priced coverage is a **lower bound** while these are non-zero. |
| `freeTokens` | Pairs the registry prices at zero (`:free` variants, self-hosted) — not a gap. |

`classifyUnpricedPair` re-reads the live registry for each zero-cost provider/model pair:

- `missingPricing` — no catalog entry; a standing gap until pricing lands.
- `ingestGap` — priced today but stored as zero; re-ingest recovers spend after an alias or registry fix.
- `freePricing` — registry price is zero; not missing money.

`summarizeUnpricedUsage` derives gap totals by subtracting classified-free usage from the window's exact zero-cost totals, never by re-summing a truncated pair list (which would overstate coverage).

## Cache economics

Cache economics works in **tokens, not dollars**: provider-reported cache spend is folded into `cost_input_microcents` and cannot be recovered by subtraction.

Per model row:

- `actualRate` — measured `cacheRead / (input + cacheRead + cacheCreate)` from token counts.
- `breakEvenRate` — from `@domain/models` pricing via `modelCacheBreakEvenRate` / `cacheBreakEvenRate`: the hit rate at which caching costs exactly what not caching would, assuming every miss is a write.
- `classifyCacheState` — six states (`optimal`, `cacheIt`, `stopCaching`, `investigate`, `correctlyOff`, `notEnoughData`) with urgencies `overpaying` / `underusing` when applicable.

Guards:

- `CACHE_ECONOMICS_MIN_CALLS` (20) — same minimum sample as cost-per-call comparisons; below this, rates are one-sample artefacts.
- `CACHE_MIN_CACHEABLE_INPUT_TOKENS` (1024) — below provider minimum cacheable prompt size, caching is unavailable rather than unprofitable.
- `ceilingRate` is null in the current UI — verdicts only fire when every achievable ceiling in `[0, 1]` agrees. Achievable-ceiling work (call-gap analysis against provider TTL) is documented in [`prompt-cache-ttl-detection.md`](./prompt-cache-ttl-detection.md).

## Breakdown and model-usage limits

- `COST_BREAKDOWN_ROW_LIMIT` (25) — rows per dimension, highest spend first; `totals` stay window-wide so shares stay honest when truncated.
- `COST_PER_CALL_MIN_SAMPLE_CALLS` (20) — cost-per-call multiples vs the window average are hidden below this.
- `MODEL_USAGE_SERIES_LIMIT` (6) — models charted individually; the rest collapse into `other`, ranked by spend so expensive low-volume models are not crowded out.
- `CACHE_ECONOMICS_ROW_LIMIT` (25) — cache table rows, split by provider because break-even is a property of the price list.

`cacheAndOtherMicrocents` on breakdown rows is `total - input - output` and is not decorative: some providers return non-additive totals or fold cache into the input side.

## Unpriced-span operations

Ingest reports unpriced spans through `shouldReportUnpricedSpan` (see `packages/domain/spans/src/helpers/should-report-unpriced.ts`) so Datadog Error Tracking groups recurring gaps.

**Backoffice triage** (`/backoffice/unpriced-spans`) lists provider/model pairs with standing decisions in `UNPRICED_TRIAGE` (`packages/domain/admin/src/unpriced-spans/unpriced-triage.ts`):

- `fixed` + `fixedAt` — tripwire: occurrences after the fix date mean the repair regressed.
- `wontFix` — judgement calls (`neverPriceable`, `notOurs`, `acceptedFree`) that no registry lookup can infer.

Adding a triage entry is a deliberate code change so the reasoning lands in the same PR as the decision.

## Development and seeds

ClickHouse span seeds include six cost archetypes (`packages/platform/db-clickhouse/src/seeds/spans/cost-archetypes/`) — coherent project personalities (healthy, regression, findings-fire, tiny, free, single-turn) for exercising the Cost section locally. See [`seeds.md`](./seeds.md) for the broader seed story.
