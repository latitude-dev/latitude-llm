# Models

`@domain/models` is the bundled [models.dev](https://models.dev) catalog and the registry that turns a reported **provider + model id** into per-token rates. The same lookups price customer spans, trace imports, hosted `llm-call` billing, and internal AI metering.

All registry operations are **synchronous and in-process**; nothing hits the network at lookup time.

## Package layout

| Piece | Role |
| --- | --- |
| `src/data/models.dev.json` | Bundled snapshot downloaded from `https://models.dev/api.json` |
| `src/entities/model.ts` | `Model` / `ModelPricing` types and `parseModelsDevData` |
| `src/entities/cost.ts` | Token usage → USD breakdown (`computeCostBreakdown`, `estimateTotalCost`) |
| `src/provider-aliases.ts` | `resolveProviderName` and `PROVIDER_ALIASES` (browser-safe, no JSON import) |
| `src/registry.ts` | `getModelForProvider`, `getCostSpec`, `estimateCost`, `findModel`, … |
| `src/prompt-cache-ttl.ts` | Hardcoded prompt-cache lifetimes (models.dev does not carry TTL; see [`prompt-cache-ttl-detection.md`](./prompt-cache-ttl-detection.md)) |

Public exports live in `packages/domain/models/src/index.ts`. UI code that only needs provider normalization can import `@domain/models` through the `browser` export (`provider-aliases.ts`).

## Refreshing the catalog

1. **Locally:** `pnpm --filter @domain/models update:models-dev` (runs `scripts/update-models-dev-data.ts`).
2. **Automated:** `.github/workflows/update-models-dev-data.yml` runs daily at 02:00 UTC (and on `workflow_dispatch`). When `models.dev.json` changes, CI runs catalog-coupled tests (`registry.test.ts`, AI metering, evaluation execution, ClickHouse cost archetypes) before opening a `chore: update bundled models.dev data` PR.

A models.dev refresh can retire or rename entries. Tests in `registry.test.ts` derive hazardous lookup cases from the bundled catalog so a refresh cannot silently reintroduce prefix false positives under new ids. When adding models to `LAT_AI_*` configuration, keep the bundled catalog current so billing does not fall back to flat `llm-call` credits (see [`billing.md`](./billing.md#credit-price-grounding)).

## Provider aliases

Instrumentations and gateways report many spellings for the same host (`amazon_bedrock`, `aws.bedrock`, `bedrock` → `amazon-bedrock`). `resolveProviderName` normalizes to the canonical models.dev provider id before any catalog scan.

Every alias target must be a provider models.dev actually prices; `provider-aliases.test.ts` asserts that. An alias pointing at an unknown provider makes lookups return `costImplemented: false` and spans stay **unpriced** rather than erroring.

## Lookup: `getModelForProvider(provider, modelId)`

This is the entry point for costing. It resolves the provider name, loads that provider's model list (indexed once per provider in a cache beside `getAllModels()`), then tries matchers **in order**. Only the **prefix fallback** can answer with a catalog id the request did not name outright; every exact matcher runs first so a neighbour cannot hijack a longer id (for example `minimax-m2.5` priced as `minimax-m2`).

**Default providers** (after alias resolution):

1. **Exact** — case-insensitive id match, or a single catalog entry whose id differs only in version punctuation (`claude-opus-4.8` vs `claude-opus-4-8` via `normalizeVersionPunctuation`).
2. **Bare id within provider** — when catalog ids look like `vendor/model` but the caller passes only `model`, match the unique `/<model>` suffix within that provider's list. Two vendors sharing a bare name stay **unpriced** (ambiguous).
3. **Vendor prefix on slug** — for `vendor/model` ids when the vendor segment is authoritative (exact match on the bare model id under the vendor provider; no prefix fallback here, so `gpt-5.3-instant` cannot collapse to `gpt-5`).
4. **Longest prefix** — absorbs snapshot dates and trailing qualifiers (`gpt-4.1-2025-04-14` → `gpt-4.1`), with guards below.

**Amazon Bedrock** adds regional and bare-foundation-model paths before prefix fallback: try the id as reported, then with `eu.` / `us.` / `apac.` stripped, then suffix match on `anthropic.<model>`-style bare ids.

`findModel(models, modelId)` on the full flat list is **exact, then prefix** — used where provider is already fixed. Do not call it for cross-provider slugs; use `getModelForProvider`.

### Prefix fallback rules

`findModelByPrefix` is intentionally conservative so a missing price is honest:

- Stops at a `:` modifier (`:free`, `:thinking`, context-size variants) so a paid base model is not used for a separately listed variant.
- **Version boundaries** — a prefix must not cross a version bump (`minimax-m2` must not answer for `minimax-m2.5`). Both `.` and `-` can introduce a version; hyphenated snapshot dates (`gpt-4-0613`, `o1-2024-12-17`) are still allowed. Rejecting a prefix for a version bump also rejects every shorter prefix.
- **Mid-number splits** — prefixes that cut through a digit run are skipped (`gpt-5-2025-04-14` resolves toward `gpt-5`, not `gpt-5-2`).

`registry.test.ts` encodes these invariants against the live bundled catalog.

## Cost APIs

| API | Use |
| --- | --- |
| `getCostSpec(provider, modelId)` | `{ costImplemented, cost, pricedProvider, pricedModel }` for ingest and billing |
| `estimateCost` / `estimateCostWithBreakdown` | USD totals from `TokenUsage` |
| `getModelPricing(model)` | Returns `model.pricing` when present; a zero rate is valid (embeddings) |

`costImplemented: false` means no rate was found — not an error. Span ingest marks those generations **unpriced** (`should-report-unpriced.ts`); billing uses the flat `llm-call` fallback and logs `billing.pricing=flat-fallback`.

Customer-reported costs on spans bypass catalog estimation when `latitude.cost.source = "user"`; see [`spans.md`](./spans.md#cost-resolution) and [`telemetry-sdk.md`](./telemetry-sdk.md#bring-your-own-cost).

## Primary consumers

- **Span OTLP ingest and imports** — `resolveSpanCost` / `estimate-span-cost.ts` (same path for live OTLP and normalized import rows).
- **Billing** — `creditsForLlmGenerationCost` prices token usage through this registry ([`billing.md`](./billing.md)).
- **Evaluations and AI features** — judge and generation calls meter through `@platform/ai` using the same catalog.
- **Seeds and benchmarks** — cost archetypes and `tools/ai-benchmarks` pick fixtures from the bundled catalog so refreshes do not stall on hardcoded model names.

## Related documentation

- [`spans.md`](./spans.md) — OTLP cost resolution and `cost_source` semantics
- [`billing.md`](./billing.md) — how registry gaps affect `llm-call` credits
- [`imports.md`](./imports.md) — vendor-reported cost vs models.dev fallback on backfill
- [`prompt-cache-ttl-detection.md`](./prompt-cache-ttl-detection.md) — cache TTL table alongside the catalog
