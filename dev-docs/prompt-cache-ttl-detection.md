# Prompt-cache TTL detection

Why the cache lifetime behind PR #4323's achievable ceiling is a hardcoded table in
`packages/domain/models/src/prompt-cache-ttl.ts`, and why that is the correct answer rather than a
placeholder for something better.

The ceiling divides cache-eligible token volume by whether each call's gap to its predecessor fits
inside the provider's cache lifetime. That lifetime is the one input the query cannot compute, and
models.dev does not carry it.

Investigated 2026-07-31 against V2 production (`latitude.spans`, ClickHouse service
`Latitude V2 PRODUCTION`), 7-day window. Every number below is reproducible with the queries given.

## Conclusion

There is **no single true TTL to discover** at any storage granularity. Provider and model determine
which lifetimes are *available*; each individual cache breakpoint within a request determines which
was *used*. The table answers the first question, which is the only one with a stable answer.

So the table is a deliberate simplification of something that has no single value, not debt. Its
error is bounded, documented, conservative in direction, and absent from the path where it drives a
recommendation.

## The six limitations

**1. We do not control what exporters send.** Though less than this framing suggests: **83.6% of
cache-writing billable spans (69.3% of cache-write tokens) come from our own `@latitude-data/*`
packages**, overwhelmingly `@latitude-data/claude-code-telemetry`. Customer-side latitude-branded
scopes add 10.0%, third-party exporters 6.4%. But controlling the emitter does not help here:
`packages/telemetry/claude-code` reads `call.tokens.cache_creation_input_tokens`, the scalar Claude
Code itself reports, so even our own package cannot forward a breakdown it never receives.

**2. Cache reporting varies by provider × exporter, not just provider.** The same Anthropic call
arrives as `gen_ai.usage.cache_creation.input_tokens`, `gen_ai.usage.cache_creation_input_tokens`,
`cache_creation_tokens`, `llm.token_count.prompt_details.cache_write`,
`ai.usage.inputTokenDetails.cacheWriteTokens`, or buried inside `ai.response.providerMetadata`.
`cacheCreateCandidates` in `packages/domain/spans/src/otlp/resolvers/usage/tokens.ts` exists because
of this.

**3. We capture every attribute an exporter emits, which is not the same as capturing the settings
sent to the provider.** `transform.ts` (lines 186-208) partitions every span attribute by value type
into `attr_string` / `attr_int` / `attr_float` / `attr_bool`, unfiltered. But TTL is a **request**
parameter, and **no exporter emits request-side cache settings, in any spelling, anywhere in
production**. What the Vercel path carries is a *response echo* of Anthropic's `usage.cache_creation`
— what the write was billed as, after the fact — not the configuration that produced it.

The only production occurrences of `cache_control` in captured content are 27 spans of coincidence:
AI SDK source code and an HTTP `Cache-Control` test that Claude Code sessions happened to be reading.
(Search `ttl` as a bare substring and it appears to hit thousands of spans; that is "little",
"settle", "bottle". As a quoted JSON key it is 48 spans, all incidental.)

**4. Nothing is mapped per provider/model, and mapping is not the blocker.** Fully mapped, the
response echo covers **4.2%** of the cache-writing spans the ceiling consumes, via a JSON path into an
unstandardised vendor passthrough that returns `0` rather than null when the shape changes.

**5. TTL varies within a single request**, not merely between spans in a session. **2,005 spans bought
both lifetimes in one request.** Anthropic permits this as long as longer TTLs appear first, so a
per-span TTL column would already be a lossy summary of its own span.

**6. Therefore no storage granularity holds the answer.** Not per project, not per agent, not per
span. See rejected options below.

## Why the table is the right response

**The ceiling is counterfactual, and that is what protects the recommendation.** It answers "if
caching were on, what could this arrival pattern reach", which is exactly what makes `Cache it`
possible for traffic that has no cache today. Whether caching is actually on is measured separately
and exactly, from `tokens_cache_read + tokens_cache_create > 0`, never assumed.

So the table's weakness does not touch the `Cache it` path at all. A customer with caching off who
turns it on gets the provider **default**, which is precisely what the table holds. The 1h
uncertainty applies only to people already caching who deliberately opted in.

**The table is therefore most reliable exactly where it drives a recommendation, and least reliable
where it only suppresses one.**

### The error's direction: a false negative

For the cohorts that do opt into 1h, understating the lifetime lowers their ceiling. It does not
produce a wrong destructive recommendation, because `stopCaching` is unreachable for them. Measured
over 7 days on billable operations, agent `orchestrator`:

| provider | model | calls | actual rate | avg prompt |
| -- | -- | --: | --: | --: |
| anthropic | claude-haiku-4-5-20251001 | 3,723 | **0.790** | 44,136 |
| anthropic.messages | claude-haiku-4-5-20251001 | 1,631 | **0.797** | 47,525 |
| anthropic | claude-sonnet-4-6 | 123 | **0.677** | 45,671 |
| anthropic.messages | claude-sonnet-4-6 | 54 | **0.743** | 44,833 |

They sit at 68-80% against Anthropic's 21.7% break-even, so `classifyCacheState` never reaches the
`actual < breakEven` branch. Understating their lifetime **suppresses a possible `underusing`
finding** and reads as `Optimal`. We say nothing where there may be reachable headroom.

That direction is the whole reason the limitation is tolerable, and it needs no special-casing in the
classifier: no 1h writer in production is below break-even.

### The cost of the null fallback, stated honestly

An unlisted (provider, model) pair resolves to `null` rather than a guessed default, so it gets no
ceiling at all. A write-premium model on an unlisted provider therefore cannot reach `Cache it` and
lands in `Not enough data`. That is the price of not guessing, and it is the right trade: #4323's
`classifyCacheState` depends on only returning verdicts that hold for every possible ceiling when the
ceiling is unknown.

## Rejected options

**Let the customer declare the lifetime** (per project or per agent, pre-filled with the documented
default). Rejected: TTL is set per **cache breakpoint within a request**, so a project- or
agent-level setting cannot express what varies below span level — the 2,005 mixed-lifetime spans are
the proof. Its effective coverage would be worse than the 4.2% it replaces, and it goes stale
silently the moment someone changes their code back.

**Feed the response echo into the ceiling.** Rejected on four grounds:

- **Silent-zero failure.** `JSONExtractUInt` returns 0 for a missing path, and
  `ai.response.providerMetadata` is unstandardised vendor passthrough. Any AI SDK or Anthropic
  reshape yields `t1h = 0`, which reads as "every write was 5m" — a confidently wrong ceiling rather
  than a null.
- **4.2% coverage means two mechanisms**, so the ceiling's provenance would vary per row with no way
  for a reader to tell which they are looking at.
- **Write-side only.** A pure cache hit carries no `cache_creation` at all, so there is no evidence
  for the calls the ceiling cares about most.
- **It breaks LAT-822**, which gates peer comparison on the ceiling and already warns that
  "comparable" is doing enormous work. Comparing agent A's measured-1h ceiling against agent B's
  table-5m ceiling confounds instrumentation with traffic, precisely the failure it names.

## The evidence behind limitation 4

The Anthropic 5m/1h split **is** in production, nested in the JSON value of
`ai.response.providerMetadata` on the Vercel AI SDK path (`scope_name` of `ai`,
`so.latitude.instrumentation.vercelai`, `gen_ai`). Verbatim from a production span:

```json
{"anthropic":{"usage":{"input_tokens":2,"cache_creation_input_tokens":52089,
"cache_read_input_tokens":0,"cache_creation":{"ephemeral_5m_input_tokens":6289,
"ephemeral_1h_input_tokens":45800},"output_tokens":216,"service_tier":"standard"}}}
```

`cache_creation` is emitted unconditionally, zeroed when nothing was written. Our resolver reads only
the scalar, which per Anthropic equals `5m + 1h`, so the split is summed away at ingest.

An earlier pass concluded no exporter sends this. That pass searched attribute **key names** for
`ttl` / `ephemeral` / `cache_control` / `expire`, which returns zero rows and is correct as far as it
goes: no exporter promotes the split to a key. It rides in a **value**, under a key whose name
contains none of those words, so a key-name census structurally cannot see it.

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
       countIf(t1h > 0 AND t5m > 0) AS spans_mixing_both
FROM x
```

**40,155 spans** across 5 orgs; 155,147,028 tokens at 5m against 107,300,620 at 1h (**40.9% of that
path's cache-write volume is 1h**); 2,675 spans wrote 1h across 3 orgs; 2,005 mixed both.

### Coverage, restricted to what the ceiling consumes

The 40,155 above counts every span carrying the breakdown, including zero-write ones. The subset the
ceiling would read is billable operations (`USAGE_OPERATIONS`) with `tokens_cache_create > 0`. Both
are correct for their own question; this is the one that governs the decision.

```sql
SELECT count() AS cache_writing_spans,
       countIf(JSONHas(attr_string['ai.response.providerMetadata'],
                       'anthropic', 'usage', 'cache_creation')) AS with_ttl_evidence,
       uniqExact(organization_id) AS orgs_total, uniqExact(scope_name) AS exporters_total
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

Thirteen `(agent, provider, model)` cohorts wrote at 1h; four wrote exclusively at 1h, all
`orchestrator`. That cohort's provider spelling already splits it across `anthropic` and
`anthropic.messages` for the same model, while #4323 partitions by `(agent, provider, model)` — a
fragmentation that exists today, independent of TTL.

## Still undetectable, and not affected by any of the above

- **OpenAI** `prompt_cache_options.ttl` — request-side only, and no request-side cache attribute of
  any kind reaches production.
- **Gemini** explicit caching — `ttl` is customer input per cache entry, never a provider constant.
- **Bedrock** `cacheDetails` — zero occurrences, in keys or values.
- **Every scalar-only exporter**: Claude Code telemetry, OpenLLMetry/Traceloop, OpenInference,
  Mastra, Sentry, Codex.

## Checked and dismissed: unmatched cache keys are not a cost bug

Several cache-shaped attribute keys match no candidate list, which looks like silent token loss. It is
not, and the check is recorded so it is not re-raised. Every one is either **identically zero** or a
**vendor-prefixed duplicate of a standard key we already resolve**, verified by comparing the
attribute's own value against the resolved column:

| key | billable spans (30d) | attribute tokens | verdict |
| -- | --: | --: | -- |
| `gen_ai.usage.input_tokens.cache_write` (`@sentry/node`) | 5,038 | **0** (max 0) | all zero, nothing to recover |
| `gen_ai.usage.input_tokens.cached` (`@sentry/node`) | 5,038 | **0** (max 0) | all zero |
| `teeming.cache_write_tokens` | 2,580 | **0** (max 0) | all zero |
| `teeming.cache_read_tokens` | 2,580 | 5,391,098,752 | duplicate — same exporter also sends `gen_ai.usage.cache_read.input_tokens` (5,083,001,472), which we resolve |
| `teeming.uncached_input_tokens` | 2,251 | 216,590,890 | duplicate — equals resolved `tokens_input` exactly |
| `driftless.usage.cache_miss_input_tokens` | 373 | 2,817,737 | duplicate — equals resolved `tokens_input`; exporter also sends matched `gen_ai.usage.cache_read_input_tokens` |
| `gen_ai.usage.cache_write.input_tokens`, `codex.turn.*`, `flue.operation.*`, `gen_ai.usage.input_cached_tokens` | 0 | — | all on `unspecified`, excluded from every cost aggregate |

No cache-write cost is misattributed, so no issue is warranted. The one genuinely unresolved key,
`gen_ai.usage.cache_read_tokens`, is on **9 spans** from `hermes.latitude.shell_hook` and a scope
literally named `so.latitude.instrumentation.cache-attribute-probe`. Likewise `hermes.latitude`'s
string-typed token attributes are not lost tokens: the values are `****`, already masked, on 107
spans.

## Traps worth keeping

- **`grep` is a shadowed shell function here**, and `transform.ts` trips binary-file detection because
  of lone surrogates, so matches are silently suppressed. Use `command grep -a`.
- **A key-name search is not an attribute search.** Values hold structured JSON.
- **Presence of a key says nothing about the value behind it.** This produced a wrong conclusion three
  times in this investigation: once by missing a payload held in a value, twice by assuming an
  unmatched key implied lost tokens. Check values, against the resolved column, before claiming
  impact.
- Span counts from `arrayJoin(mapKeys(...))` grouped **by key** are correct, since a map holds each
  key once. The inflation risk is counting the arrayJoin rows *without* grouping by key.
