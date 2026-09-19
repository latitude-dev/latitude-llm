# Model registry and cost estimation

`@domain/models` is the synchronous, offline registry Latitude uses to price spans, estimate LLM billing credits, and answer model-metadata questions. It reads a **bundled** snapshot of [models.dev](https://models.dev) JSON — no runtime network calls — so ingest, workers, and the web UI all share one deterministic catalog.

Operator-facing model lists are not this package's job; it exists for **cost lookup** and **provider normalization** at the boundary where OTLP metadata meets dollars.

## Data source

| Piece | Location |
| --- | --- |
| Bundled catalog | `packages/domain/models/src/data/models.dev.json` |
| Parser | `parseModelsDevData` in `entities/model.ts` |
| Registry API | `registry.ts` (`getAllModels`, `findModel`, `getModelForProvider`, `getCostSpec`, `estimateCost`, …) |
| Provider aliases | `provider-aliases.ts` (`PROVIDER_ALIASES`, `resolveProviderName`) |
| Prompt-cache TTL table | `prompt-cache-ttl.ts` (not in models.dev — see [`prompt-cache-ttl-detection.md`](./prompt-cache-ttl-detection.md)) |

`getAllModels()` parses and caches the JSON on first call. The browser entry (`src/browser.ts`) re-exports types, Zod schemas, `resolveProviderName`, and the prompt-cache helpers only — it never imports the bundled JSON, so client bundles stay small.

## Provider aliases

OTLP exporters spell the same vendor many ways (`amazon_bedrock`, `bedrock`, `aws.bedrock`, `@ai-sdk/amazon-bedrock`, …). `resolveProviderName` maps every alias to the canonical models.dev provider id **before** any catalog lookup.

Every alias target must be a provider the bundled catalog actually prices. A typo or stale alias silently yields `costImplemented: false` (zero cost), so `provider-aliases.test.ts` asserts each target exists in the catalog.

Notable mappings:

- `gateway` → `vercel` (Vercel AI Gateway reports `gateway` as its provider; models.dev files those models under `vercel`).
- Bedrock regional prefixes (`eu.`, `us.`, `apac.`) are stripped inside `getModelForProvider`, not in the alias table.

## Model resolution

`getModelForProvider(provider, modelId)` is the entry point for pricing. Resolution order within a provider's model list:

1. **Exact id** (case-insensitive).
2. **Version punctuation** — `claude-opus-4.8` matches `claude-opus-4-8` when exactly one catalog entry normalises to the same form. Ambiguous collapses return nothing rather than pick arbitrarily.
3. **Longest prefix** — `gpt-4o-2024-11-20` matches `gpt-4o`. Stops at a `:` modifier (`:free`, `:thinking`, …) so a free tier is never priced at the paid rate.
4. **Bedrock-only fallbacks** — strip `eu.`/`us.`/`apac.` prefix; then match a bare foundation id missing the `<vendor>.` prefix (`claude-opus-4-8` → `anthropic.claude-opus-4-8`).
5. **Bare id within provider** — when a gateway host's catalog ids are `<vendor>/<model>` slugs but the API is called with the bare model name, match only when **exactly one** listing in that provider ends with `/<modelId>`. Two vendors shipping the same bare name stay unpriced.
6. **Vendor-prefix slug** — for `<vendor>/<model>` ids, price from the vendor's own listing when the reported provider is unknown or duplicates the vendor namespace. Deliberately **not** `findModel` prefix fallback here — that would borrow a neighbour's rate.

`getCostSpec` wraps the lookup and returns `{ costImplemented, cost, pricedProvider, pricedModel }`. A model with `pricing.input: 0` is still priced (embeddings charge input only); only a missing `pricing` object is unpriced.

## Cost estimation

Token usage flows through `estimateCost` / `estimateCostWithBreakdown` / `computeTokenCost`. Rates are **per 1M tokens** in USD. Supported tiers: `input`, `output`, `reasoning`, `cacheRead`, `cacheWrite`.

Downstream consumers:

- **Span ingest** — fills `cost_total_microcents` when the exporter did not report vendor cost.
- **Billing** — `creditsForLlmGenerationCost` in `@domain/billing` (see [`billing.md`](./billing.md)).
- **Imports** — models.dev is the fallback when Langfuse/LangSmith/Braintrust supply no vendor cost (see [`imports.md`](./imports.md)).
- **Seeds** — cost-archetype fixtures in `@platform/db-clickhouse` filter candidates against live registry pricing.

Vendor-reported cost on a span always wins over a registry estimate at ingest time.

## Catalog refresh

The bundled JSON is refreshed by automation, not at runtime.

| Step | Command / location |
| --- | --- |
| Local update | `pnpm --filter @domain/models update:models-dev` (`scripts/update-models-dev-data.ts` → `https://models.dev/api.json`) |
| CI | `.github/workflows/update-models-dev-data.yml` — daily 02:00 UTC; opens a PR when the file changes |
| Pre-merge gate | Registry tests, AI metering, evaluation execution, and cost-archetype seeds run against the refreshed file before the PR is created |

When models.dev retires or renames a listing, catalog-coupled tests are the guardrail — not hard-coded model slugs in fixtures. Derive gateway and free-tier examples from `getAllModels()` / `getCostSpec` at test time so a catalog rotation fails loudly only when behavior actually breaks, not when an arbitrary slug disappears.

## Related

- [`prompt-cache-ttl-detection.md`](./prompt-cache-ttl-detection.md) — why cache lifetime lives in a hardcoded table models.dev does not provide.
- [`spans.md`](./spans.md) — OTLP resolver candidate lists that feed `provider` and `model` into this registry.
- [`billing.md`](./billing.md) — how registry pricing feeds credit metering.
- [`imports.md`](./imports.md) — vendor-reported cost precedence over registry estimates.
- [`agent-data-access.md`](./agent-data-access.md) — `queryAnalytics` cost fields are already in human dollars; ingest stores microcents.
