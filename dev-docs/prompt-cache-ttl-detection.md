# Prompt-cache TTL detection

Whether span ingestion can observe the cache lifetime a provider actually used, rather than the one
`packages/domain/models/src/prompt-cache-ttl.ts` assumes. The achievable ceiling in PR #4323 divides
cache-eligible token volume by whether each call's gap to its predecessor fits inside that lifetime,
so a customer opting into a longer TTL has a higher real ceiling than we report.

Investigated 2026-07-31 against V2 production (`latitude.spans`, ClickHouse service
`Latitude V2 PRODUCTION`), 7-day window.

## Verdict

The Anthropic 5m/1h split **is** present in production, nested inside the JSON value of
`ai.response.providerMetadata` on the Vercel AI SDK path. Where it appears, **40.9% of that path's
cache-write volume is 1h**, across 3 organizations.

But it covers **4.2% of the cache-writing spans the ceiling actually consumes**, and the parse fails
silently in the wrong direction. So this finding is an **error bar on the static table** — it
quantifies how wrong the table can be for real customers — and **not a candidate input to the
ceiling**. The reliable fix is to let customers *declare* the lifetime, not to sniff vendor JSON.

An earlier pass concluded no exporter sends per-TTL data. That pass searched attribute **key names**
for `ttl` / `ephemeral` / `cache_control` / `expire`. That returns zero rows and is correct as far as
it goes: no exporter promotes the split to a key. The field is carried in a **value**, under a key
whose name contains none of those words, so a key-name census structurally cannot see it. That is the
methodological point worth keeping, and it recurs below.

## Unmatched attributes are retained

`packages/domain/spans/src/otlp/transform.ts` (lines 186-208) loops over every span attribute and
partitions it by value type into `attr_string` / `attr_int` / `attr_float` / `attr_bool`. Nothing is
filtered on the way in. Production carries a full record of every attribute we do not otherwise
resolve, so coverage questions like this one are answerable by query, and no sampled ingest probe is
needed to answer them.

Two traps produced the opposite belief, both worth knowing:

- `grep` is a shadowed shell function in this environment, and `transform.ts` trips binary-file
  detection because of lone surrogates, so matches are silently suppressed. Use `command grep -a`.
- A key-name search is not an attribute search. Values hold structured JSON.

## Where the signal is

Key `ai.response.providerMetadata`, emitted by the Vercel AI SDK (`scope_name` of `ai`,
`so.latitude.instrumentation.vercelai`, and `gen_ai`). Verbatim value from a production span:

```json
{"anthropic":{"usage":{"input_tokens":2,"cache_creation_input_tokens":52089,
"cache_read_input_tokens":0,"cache_creation":{"ephemeral_5m_input_tokens":6289,
"ephemeral_1h_input_tokens":45800},"output_tokens":216,"service_tier":"standard"}}}
```

`cache_creation` is emitted unconditionally, zeroed when nothing was written. Our resolver reads only
the scalar (`cacheCreateCandidates` in
`packages/domain/spans/src/otlp/resolvers/usage/tokens.ts`), which per Anthropic equals `5m + 1h`, so
the split is summed away at ingest.

### Re-run query

```sql
WITH pm AS (
  SELECT attr_string['ai.response.providerMetadata'] AS j,
         coalesce(nullIf(agent_name, ''), service_name) AS agent, provider, model, organization_id
  FROM latitude.spans
  WHERE start_time >= now() - INTERVAL 7 DAY
    AND has(mapKeys(attr_string), 'ai.response.providerMetadata')
), x AS (
  SELECT agent, provider, model, organization_id,
         JSONExtractUInt(j, 'anthropic', 'usage', 'cache_creation', 'ephemeral_5m_input_tokens') AS t5m,
         JSONExtractUInt(j, 'anthropic', 'usage', 'cache_creation', 'ephemeral_1h_input_tokens') AS t1h
  FROM pm WHERE JSONHas(j, 'anthropic', 'usage', 'cache_creation')
)
SELECT count() AS spans, uniqExact(organization_id) AS orgs,
       sum(t5m) AS tokens_5m, sum(t1h) AS tokens_1h,
       countIf(t1h > 0) AS spans_writing_1h,
       uniqExactIf(organization_id, t1h > 0) AS orgs_writing_1h,
       countIf(t1h > 0 AND t5m > 0) AS spans_mixing_both
FROM x
```

**40,155 spans** carry the breakdown across 5 orgs; 155,147,028 tokens at 5m against 107,300,620 at
1h; 2,675 spans wrote 1h; 3 orgs wrote 1h; **2,005 spans mixed both lifetimes in one request**.

## Coverage: 4.2% of what the ceiling consumes

The 40,155 above counts every span carrying the breakdown, including zero-write ones. The subset the
ceiling would actually read is billable operations (`USAGE_OPERATIONS`) with
`tokens_cache_create > 0`. Both numbers are correct for their own question; this is the one that
governs the recommendation.

```sql
SELECT count() AS cache_writing_spans,
       countIf(JSONHas(attr_string['ai.response.providerMetadata'],
                       'anthropic', 'usage', 'cache_creation')) AS with_ttl_evidence,
       uniqExact(organization_id) AS orgs_total,
       uniqExact(scope_name) AS exporters_total,
       sum(tokens_cache_create) AS cache_write_tokens
FROM latitude.spans
WHERE start_time >= now() - INTERVAL 7 DAY
  AND operation IN ('chat','text_completion','generate_content','embeddings','reranker')
  AND tokens_cache_create > 0
```

| | |
| -- | --: |
| cache-writing spans | 282,009 |
| with TTL evidence | **11,864 → 4.2%** |
| by tokens | 127,294,175 of 1,900,655,079 → **6.7%** |
| orgs with evidence | **3 of 72** |
| exporters with evidence | **3 of 12** |

95.8% of cache-writing spans fall back to the table regardless.

## Why this must not feed the ceiling

- **Silent-zero failure.** `JSONExtractUInt` returns 0 for a missing path.
  `ai.response.providerMetadata` is an unstandardised passthrough of provider response JSON, so any
  AI SDK or Anthropic API reshape does not produce an absence — it produces `t1h = 0`, which reads as
  "every write was 5m". A confidently wrong ceiling rather than a null. That is the same
  presence-versus-value confusion that produced every wrong conclusion in this investigation.
- **4.2% coverage means two mechanisms**, so the ceiling becomes a number whose provenance varies per
  row, with no way for a reader to tell which they are looking at.
- **Write-side only, and not even one value per agent.** A pure cache hit carries no `cache_creation`
  at all, so there is no evidence for the calls the ceiling cares about most; and 2,005 spans bought
  both lifetimes in a single request, so "this agent uses 1h" is not a fact that exists for all of
  them.
- **It breaks LAT-822.** That issue gates peer comparison on the ceiling and already warns that
  "comparable" is doing enormous work. Comparing agent A's measured-1h ceiling against agent B's
  table-5m ceiling confounds instrumentation with traffic, which is precisely the failure it names.

## The reliable alternative: let the customer declare it

A proposal, not built. Rather than inferring the lifetime from vendor JSON, let it be **declared**
per project or per agent, pre-filled with the documented provider default from the existing table.
Explicit, stable, and free of any dependency on exporter internals. The table already *is* a
declaration on the customer's behalf; this only lets someone who knows better override it. Anyone
paying 2x for 1h writes knows they are doing it.

An unlisted pair with no declaration must still resolve to `null` rather than a guessed default, so
#4323's `classifyCacheState` keeps only returning verdicts that hold for every possible ceiling when
the ceiling is unknown.

## Who the error bar covers

Thirteen `(agent, provider, model)` cohorts wrote at 1h. Four wrote **exclusively** at 1h:

| agent | provider | model | spans | tokens 5m | tokens 1h | share 1h |
| -- | -- | -- | --: | --: | --: | --: |
| `unknown_service:/usr/local/bin/node` | anthropic | claude-opus-4-8 | 14,764 | 123,630,786 | 73,454,882 | 0.373 |
| `orchestrator` | anthropic.messages | claude-haiku-4-5-20251001 | 2,664 | 0 | 12,600,209 | **1.000** |
| `orchestrator` | anthropic | claude-haiku-4-5-20251001 | 3,855 | 0 | 12,055,655 | **1.000** |
| `unknown_service:/usr/local/bin/node` | anthropic | claude-sonnet-5 | 934 | 9,457,682 | 3,533,550 | 0.272 |
| `unknown_service:node` | anthropic.messages | claude-opus-4-8 | 371 | 2,277,866 | 1,527,562 | 0.401 |
| `orchestrator` | anthropic | claude-sonnet-4-6 | 132 | 0 | 735,750 | **1.000** |
| `orchestrator` | anthropic.messages | claude-sonnet-4-6 | 77 | 0 | 654,000 | **1.000** |

`orchestrator` writes nothing at 5m, so #4323 measures its ceiling against a 300 s window when the
lifetime it actually bought is 3600 s — a 12x understatement of the reusable gap, on exactly the
cohort shape most likely to be told its cache is unfixable. That is the size of the error bar, and
the case a declared setting would fix.

Note that provider spelling already splits this cohort across `anthropic` and `anthropic.messages`
for the same model, while #4323 partitions by `(agent, provider, model)`. That fragmentation exists
today and is independent of TTL.

## Still undetectable

- **OpenAI** `prompt_cache_options.ttl` — request-side only; no response field, and no request-side
  cache attribute of any kind appears in production.
- **Gemini** explicit caching — `ttl` is customer input per cache entry, never a provider constant.
- **Bedrock** `cacheDetails` — zero occurrences in production, in keys or values.
- **Every scalar-only exporter**: Claude Code telemetry, OpenLLMetry/Traceloop, OpenInference,
  Mastra, Sentry, Codex. Our own `packages/telemetry/claude-code` reads
  `call.tokens.cache_creation_input_tokens`, the scalar Claude Code itself reports, so even the
  emitter we control cannot forward a breakdown it never receives.

## Checked and dismissed: unmatched cache keys are not a cost bug

Several cache-shaped attribute keys match no candidate list, which looks like silent token loss. It
is not, and the check is worth recording so it is not re-raised.

Every one is either **identically zero** or a **vendor-prefixed duplicate of a standard key we
already resolve**, verified by comparing the attribute's own value against the resolved column:

| key | billable spans (30d) | attribute tokens | verdict |
| -- | --: | --: | -- |
| `gen_ai.usage.input_tokens.cache_write` (`@sentry/node`) | 5,038 | **0** (max 0) | all zero, nothing to recover |
| `gen_ai.usage.input_tokens.cached` (`@sentry/node`) | 5,038 | **0** (max 0) | all zero |
| `teeming.cache_write_tokens` | 2,580 | **0** (max 0) | all zero |
| `teeming.cache_read_tokens` | 2,580 | 5,391,098,752 | duplicate — the same exporter also sends `gen_ai.usage.cache_read.input_tokens` (5,083,001,472), which we resolve |
| `teeming.uncached_input_tokens` | 2,251 | 216,590,890 | duplicate — equals resolved `tokens_input` exactly |
| `driftless.usage.cache_miss_input_tokens` | 373 | 2,817,737 | duplicate — equals resolved `tokens_input`; exporter also sends matched `gen_ai.usage.cache_read_input_tokens` |
| `gen_ai.usage.cache_write.input_tokens`, `codex.turn.*`, `flue.operation.*`, `gen_ai.usage.input_cached_tokens` | 0 | — | all on `unspecified`, excluded from every cost aggregate |

So no cache-write cost is misattributed and no issue is warranted. The one genuinely unresolved key,
`gen_ai.usage.cache_read_tokens`, appears on **9 spans** from `hermes.latitude.shell_hook` and a
scope literally named `so.latitude.instrumentation.cache-attribute-probe`.

Likewise `hermes.latitude`'s string-typed token attributes are not lost tokens: the values are
`****`, already masked, on 107 spans. There is nothing behind them to parse.

**The recurring lesson:** presence of a key says nothing about the value behind it. Inferring impact
from a key census produced a wrong conclusion three times in this investigation — once by missing a
payload held in a value, twice by assuming an unmatched key implied lost tokens. Check values, and
check them against the resolved column, before claiming impact. (Span counts from
`arrayJoin(mapKeys(...))` grouped **by key** are correct, since a map holds each key once; the
inflation risk is counting the arrayJoin rows *without* grouping by key.)
