# Prompt-cache TTL detection

Whether span ingestion can observe the cache lifetime a provider actually used, rather than the one
`packages/domain/models/src/prompt-cache-ttl.ts` assumes. The achievable ceiling in PR #4323 divides
cache-eligible token volume by whether each call's gap to its predecessor fits inside that lifetime,
so a customer opting into a longer TTL has a higher real ceiling than we report.

Investigated 2026-07-31 against V2 production (`latitude.spans`, ClickHouse service
`Latitude V2 PRODUCTION`), 7-day window.

## Verdict

**The Anthropic 5m/1h split is present in production and is parseable today.** It arrives on the
Vercel AI SDK path, nested inside the JSON value of `ai.response.providerMetadata`. Over 7 days:
**107,300,620 tokens written at a 1h lifetime against 155,147,028 at 5m — 40.9% of that path's
cache-write volume is 1h**, across 3 organizations.

This contradicts an earlier negative conclusion. That conclusion came from searching attribute
**key names** for `ttl` / `ephemeral` / `cache_control` / `expire`, which returns zero rows and is
correct as far as it goes: no exporter promotes the split to an attribute key. But the field is
carried in a **value**, under a key whose name contains none of those words, so a key-name census
structurally cannot see it.

## Unmatched attributes are retained

`packages/domain/spans/src/otlp/transform.ts` (lines 186-208) loops over every span attribute and
partitions it by value type into `attr_string` / `attr_int` / `attr_float` / `attr_bool`. Nothing is
filtered on the way in. Production carries a full record of every attribute we do not otherwise
resolve, and coverage questions like this one are answerable by query.

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

`cache_creation` is emitted unconditionally, zeroed when nothing was written, so `ephemeral_1h == 0`
is real evidence of a 5m lifetime rather than missing data.

Our resolver reads only the scalar (`cacheCreateCandidates` in
`packages/domain/spans/src/otlp/resolvers/usage/tokens.ts`), which per Anthropic equals
`5m + 1h`, so the split is summed away at ingest.

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

Measured: 40,155 spans carry the breakdown across 5 orgs; 2,675 wrote 1h; 3 orgs wrote 1h; 2,005
spans mixed both lifetimes in one request.

## Who it affects

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

`orchestrator` writes nothing at 5m. #4323 measures its ceiling against a 300 s window when the
lifetime it actually bought is 3600 s — a 12x understatement of the reusable gap, on exactly the
cohort shape most likely to be told its cache is unfixable.

## Still undetectable

Nothing here changes for:

- **OpenAI** `prompt_cache_options.ttl` — request-side only; no response field, and no request-side
  cache attribute of any kind appears in production.
- **Gemini** explicit caching — `ttl` is customer input per cache entry, never a provider constant.
- **Bedrock** `cacheDetails` — zero occurrences in production, in keys or values.
- **Every scalar-only exporter**: Claude Code telemetry, OpenLLMetry/Traceloop, OpenInference,
  Mastra, Sentry, Codex. Our own `packages/telemetry/claude-code` reads
  `call.tokens.cache_creation_input_tokens`, the scalar Claude Code itself reports, so even the
  emitter we control cannot forward a breakdown it never receives.

So the static table stays the fallback for everything except Anthropic-via-Vercel-AI-SDK, and an
unlisted pair with no evidence must still resolve to `null` rather than a guessed default — #4323's
`classifyCacheState` depends on only returning verdicts that hold for every possible ceiling when
the ceiling is unknown.

## Constraints on capturing it

Recorded because they are what makes this non-trivial, not as a design:

- **Write-side only.** A pure cache hit has no `cache_creation` and therefore no TTL evidence, so a
  per-span lifetime is unavailable for exactly the calls the ceiling cares about most. Only
  agent-level inference is achievable — "this agent wrote 1h entries this window, treat 1h as its
  lifetime" — which is wrong when config changed mid-window, when the agent never wrote in the
  window, and for the 2,005 spans mixing both lifetimes in one request (Anthropic permits this when
  longer TTLs appear first).
- **Do not derive one value by subtracting the other.** `5m + 1h == cache_creation_input_tokens`
  holds per span, but against our resolved `tokens_cache_create` it breaks on 3.2% of spans holding
  **24% of all 1h tokens**. The break concentrates on Vercel roll-up spans: `ai.streamText` carries
  the summed scalar with only the last step's breakdown, while `ai.streamText.doStream` carries the
  per-call pair. Both would need storing explicitly.
- **The same roll-up pair double-counts** parent and leaf, so any aggregate inherits whatever
  de-duplication the cost queries already apply.
- **Provider spelling splits cohorts.** `orchestrator` appears under both `anthropic` and
  `anthropic.messages` for the same model, and #4323 partitions by `(agent, provider, model)`. That
  fragmentation exists today, independent of TTL.
- **Storage.** `attr_int` is the natural landing place but is documented detail-view-only, and
  ClickHouse map lookups are not indexed, so aggregating `attr_int['...']` over a project-month scan
  is the wrong shape. A promoted column beside `tokens_cache_create` would be required for the
  ceiling query to depend on it.

## Recommendation

Treat the understatement as a known limitation of #4323 for now, and keep the static table as the
only source of cache lifetime. The gap is real and quantified above rather than hypothetical, so it
is a scoped follow-up, not a closed question.

A recheck trigger is worth having whichever way that goes, because the census that missed this would
miss the next spelling too. The cheap version is the query above plus a periodic sweep of unmatched
`gen_ai.usage.*` keys by exporter.

## Byproduct: cache-write spellings we silently drop

The key census surfaced real cache-write attributes no candidate list matches, so these count as
zero cache tokens and their cost is misattributed to plain input:

| key | spans (30d) | exporter |
| -- | --: | -- |
| `gen_ai.usage.input_tokens.cache_write` | 9,777 | `@sentry/node` |
| `gen_ai.usage.cache_write.input_tokens` | 2,154 | `codex-app-server`, `Codex Desktop` |
| `teeming.cache_write_tokens` | 2,582 | `@teeming-ai/tavi-public-trigger` |
| `codex.turn.token_usage.cache_write_input_tokens` | 378 | `codex-app-server` |
| `flue.operation.usage.cache_write_tokens` | 498 | `@flue/opentelemetry` |
| `gen_ai.usage.input_cached_tokens` | 90 | `livekit-agents` |

Separately, `hermes.latitude` emits its token counts as **strings**, landing in `attr_string`, where
the int-typed resolvers cannot see them at all.
