# Data destinations — QA runbook

End-to-end manual QA for the PostHog data-destination pipeline (Phase 1 + Phase 2, all merged).
Companion to [`data-destinations.md`](./data-destinations.md). Run this before starting Phase 3.

> **Multi-source (LAT-684):** the engine is now per-`(destination, source)`. Cursors live in `destination_sources` (one row per source), the sweep selects due **cursor rows** and fans out one `runSync` per `(destination, source)` (`dedupeKey: destinations:runSync:${destinationId}:${source}`), and `destination_sync_runs` carries a `source` column. **v1 wires only the `spans` source**, so every QA step below still exercises spans end-to-end — but expect the scheduling/cursor/audit mechanics to be per-source. Quarantine and credentials stay **destination-level**; cursor position + idle backoff are **per-source**.

## Real constants (source: `@domain/destinations/constants.ts`)

| Knob | Value | Notes |
| --- | --- | --- |
| Sweep cadence | every minute (`* * * * *`) | selects *due* `(destination, source)` cursor rows |
| Sync interval (default / min / max) | 5 min / 1 min / 60 min | per-destination `config.intervalMs` |
| Safety lag | 5 min | window ends at `now − 5min`; fresh spans don't deliver for ≥5 min |
| Max spans / run | 50k (1k–50k) | per-destination `config.maxSpansPerRun` |
| Quarantine threshold | 5 consecutive terminal failures | `DESTINATION_QUARANTINE_FAILURE_THRESHOLD` — **destination-level** (across all its sources) |
| runSync BullMQ retries | 5 attempts, 30s exponential backoff | exhausting them = **one** terminal failure |
| Idle backoff ceiling | 1 hour | **per-source** (`destination_sources.consecutive_empty_runs`); only empty runs back off |
| Max event bytes | 1 MiB default | adapter owns the live vendor cap |
| Sync-run retention | 30 days, pruned nightly 03:30 UTC | |

**Timing implication:** first delivery ≈ safety lag + the next sweep tick. A freshly-created destination is due immediately, so it delivers its first batch on the first sweep after the spans cross the lag; the interval only spaces out *later* runs. Don't call it "stuck" before lag + one idle-backoff cycle has passed.

**Fast local QA (the single lever):** set `LAT_DEV_DESTINATIONS_SAFETY_LAG_MS=30000` in `.env.development` (dev-only env, prod-ignored, restart workers) so spans become eligible in 30s. Optionally set `config.intervalMs = 60000` on the test destination (no UI knob — `UPDATE …destinations SET config = jsonb_set(config,'{intervalMs}','60000')`) for a 1-min cadence. Net: seed-to-PostHog in ~1 min instead of ~6. Note: 1 min is the floor — the sweep cron is per-minute, so sub-minute intervals do nothing.

## Setup

1. **Stack running:** docker infra + `web`, `workers`, `ingest`. The **sweep only runs if the workers app is up.**
2. **Flag on:** enable `destinations` for the Acme org via `/backoffice` → Feature flags (or enable-for-all in dev). Without it the settings UI is hidden.
3. **PostHog target:** a real PostHog project — note its ingestion host (US `https://us.i.posthog.com` / EU `https://eu.i.posthog.com`) and project API key (`phc_…`).
4. **Seed-traces tool:** `tools/live-seeds`. From that dir: `pnpm seed:live-seeds --list-fixtures`, then e.g.
   `pnpm seed:live-seeds --project-slug <slug> --count-per-fixture 5`. This drives spans into a project's ingest path (it does **not** touch destinations).
5. **Observe results in four places:** PostHog LLM Analytics (events landed), the settings → Data destinations card (status + "last synced … · N events", sourced from the latest `destination_sync_runs` row — the destination DTO no longer carries `lastRunAt`), the `destination_sources` table (per-source watermark, `last_run_at`, `consecutive_empty_runs`), and the `destination_sync_runs` table / worker logs (`destinations.runSync … source=spans …` lines, one row per `(destination, source)` run).

---

## 0. PostHog invalid-key behavior — RESOLVED (2026-06-16)

Probed both endpoints with a garbage `phc_` key:

- **`/batch/` (runtime delivery)** → `200 {"status":"Ok"}` on US **and** EU, even for an invalid key. Capture is fire-and-forget; PostHog validates asynchronously. **Consequence:** runtime delivery never quarantines on a bad/revoked key — a wrong key silently no-ops (data just never lands). Accepted, by design.
- **`/flags/?v=2` (test-connection)** → `401 authentication_failed` for an invalid key. So the pre-save **test-connection genuinely validates the key** (the deliverer's `testConnection` already probes this endpoint, not `/batch/`). Caveat: the flags endpoint is cache-backed, so it is not a perfectly real-time validity oracle.

**Status:** fine for now. The deliverer's `401/403 → invalid_api_key` mapping is effectively reachable only via `/flags/` (test-connection), not via `/batch/` (delivery). The one residual gap — a key revoked *after* creation stops delivering silently with no quarantine — is acceptable; the deferred fix is an **hourly connection-revalidation sweep** against active destinations (see follow-ups). No QA blocker.

> For quarantine QA, use the **transport-failure** path (§8b) — bad keys will *not* trigger it.

---

## 1. Happy path — ✅ VERIFIED (2026-06-16)

Created a PostHog destination, seeded 52 spans → **delivered 92 events** to PostHog (root spans expand to `$ai_trace` + generation/span), `destination_sync_runs` row `succeeded`, cursor advanced to the last delivered span, **cost faithful** (`input+output == total`, ~$0.05 across the batch). Confirmed twice across re-created projects.

- [x] Create a PostHog destination from settings (region/host + key + name, payloads ON).
- [x] Seed traces into the project (mix of LLM calls, tool spans, a root span, an embedding).
- [x] Wait ≥1 interval + safety lag (≈6–10 min, or use the fast-QA lever above).
- [x] In PostHog LLM Analytics, confirm: `$ai_generation`, `$ai_span`, `$ai_trace` (root), `$ai_embedding`.
- [x] Spot-check props: `$ai_trace_id`/`$ai_span_id`/`$ai_parent_id`, `$ai_session_id` grouping, latency, tokens, **cost in USD** (microcents→USD), `latitude_project_id`/`latitude_span_url`.
- [x] Card shows `active` + "last synced … · N events"; `destination_sync_runs` row `status=succeeded`.

## 2. Idempotency (most important correctness check) — ✅ VERIFIED (2026-06-17)

Re-delivered an already-synced window twice by rewinding the per-source cursor and letting the sweep re-run. Each event's dedup identity is `uuidV5(${destinationId}:${spanId}:${eventType})` (`mappers/posthog.ts`), so re-delivering a span regenerates the **same UUID**. Two complementary checks:

- **Full re-delivery (no-growth):** rewound to re-cover all 155 already-delivered spans → run re-sent **274 events**, and PostHog `uniqExact(uuid)` stayed **flat at 274**. Pure re-delivery is a no-op on distinct identity.
- **Wider rewind (new + re-sent mixed):** rewound *behind* the destination's initial watermark, sweeping up 52 spans that had never been delivered. `uniqExact(uuid)` grew by **exactly 92** (the new spans only), **not** by the re-sent ones — if UUIDs were non-deterministic it would have ~doubled.

> **How to assert it — key on `uniqExact(uuid)`, not raw `count()`.** PostHog dedup is **eventual**, not synchronous: it collapses rows sharing `[timestamp, distinct_id, event, uuid]` at ClickHouse merge time ("can take a week or two", PostHog docs). So immediately after a re-sync, raw `count()` **does** show duplicate rows (they collapse later). The real-time correctness signal is that **distinct UUIDs don't grow** for re-delivered spans (and any dupes share the full dedup-key tuple). Verify in the customer's PostHog with:
> ```sql
> SELECT count() AS rows, uniqExact(uuid) AS distinct_uuids
> FROM events WHERE properties.latitude_project_id = '<projectId>' AND timestamp > now() - INTERVAL 7 DAY
> ```

- [x] Re-deliver the same window — re-run the destination over already-synced data (rewind the cursor; see below).
- [x] Confirm **distinct UUIDs (`uniqExact(uuid)`) do not grow** on re-delivery. (Raw row count grows transiently until PostHog's eventual merge-time dedup collapses the identical rows.)

**Cursor rewind for re-delivery QA** (the table is `destination_sources` — the cursor lives there, one row per `(destination, source)`):
```sql
UPDATE latitude.destination_sources
SET watermark = '<ts before the spans>', watermark_id = '',
    last_run_at = NULL, consecutive_empty_runs = 0, updated_at = NOW()
WHERE destination_id = '<id>' AND source = 'spans';
```
`last_run_at = NULL` makes the row immediately due; the next sweep tick re-runs over `(watermark, now − safetyLag]`. To re-deliver *only* already-synced spans (clean no-growth case), set `watermark` inside the previously-delivered range, not before it.

## 3. Payload exclusion (`excludePayloads`)

- [x] Toggle `excludePayloads` ON, seed new traces, sync.
- [x] In PostHog: `$ai_input`, `$ai_output_choices`, `$ai_input_state`, `$ai_output_state`, `$ai_tools` are null; `$ai_error` shows `error_type` only.
- [x] Tokens, costs, latency, model/provider, ids, timing **still present**.

## 4. Pause / resume + backlog catch-up — ✅ VERIFIED (2026-06-17)

Paused an `active` destination (`destinations.status = 'paused'`), seeded **53 spans** while paused, then resumed. The `status='active'` filter in `listDue` is the whole gate — pause froze everything, resume let the backlog catch up in one capped run from the untouched cursor.

- **Paused:** sweep selected it **0 times** across multiple ticks; `destination_sources` cursor stayed frozen (`watermark`, `last_run_at`, `consecutive_empty_runs` all untouched); the 53 seeded spans crossed the safety lag but **stayed undelivered** (PostHog `uniqExact(uuid)` held flat) — pause was the only thing stopping them.
- **Resumed:** cursor left as-is (`resumeDestinationUseCase` doesn't poke it); the frozen `last_run_at` was already past-due, so the **next sweep tick ran one catch-up**: 53 spans → 94 events, window `(frozen watermark, now − lag]`, cursor advanced to the last span, `consecutive_empty_runs` reset to 0.
- **Backlog landed:** PostHog distinct UUIDs grew by exactly **+94** (the paused-period events).

- [x] Pause an active destination → card `paused`, sweep stops selecting it (no new runs in logs).
- [x] While paused, seed more traces.
- [x] Resume → status `active`; subsequent runs catch up the backlog (per-source cursor untouched while paused). Confirm the paused-period spans land in PostHog (assert via `uniqExact(uuid)`, not raw `count()` — see §2).

## 5. Idle backoff — ✅ VERIFIED (2026-06-17)

Left an `active` destination idle (`intervalMs=60000`), watched `consecutive_empty_runs` climb, then seeded 33 spans to confirm the reset.

- **Backoff grows exponentially:** `consecutive_empty_runs` walked `0→4` while idle; inter-run gaps roughly doubled `60→120→240→480s`. Each empty run advanced `watermark` to window-end (`now − lag`) and **wrote no `destination_sync_runs` row**; the destination's quarantine counter stayed `active/0` (empty runs don't touch it). Effective interval = `min(intervalMs · 2^n, 1h ceiling)`.
- **Reset on new traffic:** the first non-empty run (the 33-span catch-up) **reset `consecutive_empty_runs → 0`** and delivered 33 spans → 57 events (`succeeded`, cursor advanced). PostHog reflected the growth (distinct rose from 368; exact aggregate subject to PostHog distributed-read variance per §2 — the run row is the authoritative delivery proof).
- **Cadence returned to `intervalMs`:** the next empty run fired ~one interval later (60s nominal), **not** the prior 960s backed-off spacing — confirming the reset.

> **Cron quantization:** observed gaps run ~60s longer than the nominal interval. The sweep is a per-minute cron, and the due instant carries a sub-second offset (`last_run_at + interval`, e.g. `…:00.072`) that lands just *after* the minute tick — so it waits for the next one. Net: a 60s interval reads as ~120s, a 480s interval as ~540s. Expected, not a bug.

- [x] On a destination with no new traces, watch the `destination_sources` row for `(destination, spans)`: empty runs advance its `watermark` to window-end and grow `consecutive_empty_runs`, so the effective interval backs off toward the 1-hour ceiling. (Empty runs write no `destination_sync_runs` row and don't touch destination quarantine state.)
- [x] Seed new traces → first non-empty run resets that source's counter; cadence returns to `intervalMs`.

## 6. Oversized event (truncate-then-drop) — ✅ VERIFIED (2026-06-17)

The truncate/drop *algorithm* is unit-tested (`mappers/posthog.test.ts`: truncate marks `latitude_truncated:true` + nulls content, `dropped=0`; still-oversized non-content → `dropped=1`). E2E here confirms the **integration**: a real run truncates, delivers, accounts, and the cursor advances.

**Truncate path (E2E, verified):** injected one span with a **~1.6 MB `input_messages`** directly into ClickHouse (`maxEventBytes` is hardcoded 1 MiB in the live path — no override — so the span must genuinely exceed it). Next run: `spans_read=1, events_sent=2, events_dropped=0, succeeded`; **cursor advanced** to that span (`watermark_id=qa6oversized0001`) — not wedged. In PostHog both emitted events (`$ai_generation` + `$ai_trace`) showed `latitude_truncated=true`, `$ai_input=null`, and props shrank to ~2 KB (the 1.6 MB content fully stripped).

**Drop path:** not exercised E2E — it needs >1 MiB of *non-content* bulk (e.g. a 1 MiB span `name`), which never occurs naturally; covered by unit test 2 (`dropped=1`). Triggering it live would require a synthetic >1 MiB non-content field.

> **Injecting an oversized span (CH):** clone a real row, overriding only `span_id`/`ingested_at`/`input_messages`. Two gotchas: `repeat()` caps at 1,000,000 (concat two for >1 MiB), and `SELECT * REPLACE (… AS span_id) … WHERE span_id = …` rebinds `span_id` *before* the WHERE → 0 rows; put the WHERE in an inner subquery and REPLACE in the outer.

- [x] Ingest a span with a multi-MB payload (> 1 MiB per-event).
- [x] Confirm the event is content-truncated (`latitude_truncated: true`) or dropped; `events_dropped` counts on the run; **cursor still advances** (destination not wedged). *(Truncate path verified E2E; drop path covered by unit test.)*

## 7. SSRF guard

- [x] Try to create/save a destination with a custom host resolving to a private IP (e.g. `https://127.0.0.1`, `https://169.254.169.254`, internal hostname).
- [x] Confirm it's rejected (schema and/or runtime in the deliverer); no request leaves the box. Confirm `http://` is rejected (https-only).

## 8. Quarantine

Quarantine is **destination-level**: a terminal failure on *any* source increments the destination's `consecutive_failures` (on the `destinations` row, not the cursor), and at 5 the whole destination flips to `quarantined` so the sweep stops selecting *all* its sources. The failed run still bumps that source's `last_run_at` so it doesn't re-enqueue immediately. (v1 has one source, so this reads the same as before — but check the counter lives on `destinations`, not `destination_sources`.)

**8a. Bad key (only if §0 returned 4xx):** set an invalid `phc_` key, `intervalMs=60000`. Watch `consecutive_failures` climb each run; at 5 → card `quarantined`, sweep stops selecting it, `last_failure_message` sanitized (status + taxonomy, **no response body**).

**8b. Transport failure (works regardless of §0):** point at an unreachable but public host (a domain that refuses/times out — *not* a private IP, which the SSRF guard rejects differently). Each runSync exhausts its 5 BullMQ retries (~7–8 min of backoff) and counts as **one** terminal failure. Slow — expect this to take a while; lower `intervalMs` and be patient, or drive `runDestinationSync` directly in a script to reach 5.

**8c. Recovery:** edit credentials/host on the quarantined destination → `consecutive_failures` resets, status back to `active`, next sweep picks it up and catches up the backlog.

## 9. Delete cascade — ✅ VERIFIED (manual, 2026-06-17)

- [x] Delete the destination → row + its `destination_sources` + `destination_sync_runs` all gone; no more runs.
- [x] Delete the **project** → confirm `ProjectDeleted` cascade removes the project's destinations + their source cursors + sync runs, and the sweep stops selecting them (privacy: residual CH spans must stop being exported).

## 10. Sandbox exclusion — ✅ VERIFIED via tests (2026-06-17)

**No live E2E needed — both guards are authoritatively covered by automated tests.** The two assertions interact: guard #1 blocks sandbox orgs from ever creating a destination/cursor through the normal path, so the only way to exercise guard #2 is to insert a sandbox cursor *directly* — which the PGlite repo test already does. A manual repro would just re-stage that same setup by hand.

- **Creation rejected at the use-case boundary:** `create-destination.ts:51` guards with `isSandbox(organization)` (`isSandbox` = `parentOrgId !== null`, `organization.ts:63`) → `SandboxOrganizationDestinationError`. Tested: `create-destination.test.ts` *"rejects sandbox organizations"* ✅.
- **`listDue` never selects sandbox rows:** real SQL predicate `isNull(organizations.parentOrgId)` (`destination-source-state-repository.ts:121`). Tested against real SQL via PGlite: `destination-source-state-repository.test.ts` *"excludes pairs belonging to sandbox organizations"* — directly inserts a sandbox-org destination **+ cursor** (bypassing the use-case) and asserts `listDue` returns only the regular one ✅.

- [x] In a sandbox / Test Mode org, confirm destination creation is rejected at the use-case boundary, and the cursor repo's `listDue` (join → `organizations`, `parent_org_id IS NULL`) never selects sandbox-org cursor rows. *(Covered by the two tests above — run them rather than staging a live sandbox org.)*

## 11. Test connection (incl. caveat)

- [x] Valid key → success; the canary event is visible in the customer's PostHog (confirm copy warns about this).
- [x] Confirm the UI copy states a valid key for the **wrong project** still "passes" — the test proves reachability + key acceptance, not project identity.

## 12. Hot path untouched (sanity) — ✅ VERIFIED via code/architecture (2026-06-17)

**Static decoupling, not a live latency benchmark** — the claim is a code-coupling property, so import analysis proves it (a dev-local latency measurement would be noisy and low-value). Confirmed:

- `apps/ingest` has **zero** references to the destinations engine (`@domain/destinations`, `@platform/data-destinations`, `runSync`, deliverers).
- The hot-path workers `span-ingestion.ts` (writes spans → ClickHouse) and `trace-end.ts` have **zero** destinations references.
- Destinations is its **own worker + queue topic** — `createDestinationsWorker` / the every-minute `"destinations"` sweep (`apps/workers/src/server.ts:321`), registered separately from `createSpanIngestionWorker`. The sweep touches spans only via **out-of-band ClickHouse reads**.

**Caveat (not a hot-path violation):** the sweep and ingestion share the **same ClickHouse cluster** — the sweep issues read queries against the `spans` table that ingestion writes to. That's shared-DB read contention, not write-path code coupling, and it's the read-load angle that matters at large-backfill scale (see LAT-681 / the long-pause discussion).

- [x] Confirm no behavioral/latency change to span ingestion while a destination is active (by design — the sweep reads ClickHouse out-of-band; nothing in `apps/ingest` or the span-ingestion worker should be on the destination path). *(Verified by import analysis — neither `apps/ingest` nor the span-ingestion/trace-end workers import the destination engine.)*

---

## Findings / follow-ups

- **BUG found + fixed (2026-06-16) — runSync deduped to once-ever.** The sweep published `runSync` with a *bare* `dedupeKey`, which the queue adapter maps to a BullMQ `jobId` retained by `removeOnComplete`. After the first run completed, its job lingered in the `completed` set and shadowed every later publish → **each destination synced exactly once, then went dormant** (cursor frozen). This was in the merged code too. Fixed by switching the sweep to `leadingThrottleMs: config.intervalMs` (TTL-windowed `deduplication` marker, no permanent jobId). Verified: destinations now sync continuously.
- **Seed cost was unfaithful (fixed 2026-06-16).** Live-seeds emitted only a tiny explicit `gen_ai.usage.total_cost` while Latitude estimated realistic input/output → `total ≠ input+output`, and PostHog showed `$0.00`. Fixed: realistic cost profiles (uniform ×2000, calibration preserved) + emit `input_cost`/`output_cost` summing to the total + recalibrated the `high-cost-traces` queue filter (`500 → 1_000_000` microcents). Now `total == input+output`, realistic.
- **Not exercisable in v1:** genuinely multi-source behavior — two sources of one destination progressing concurrently with independent per-source backoff, and a `(destination, source)` dedupe key keeping them from colliding — can't be QA'd until a second source (issues/scores) is wired (LAT-684 half B). v1 only verifies the single (`spans`) source flowing through the per-source machinery.
- **Deferred:** hourly connection-revalidation sweep against active destinations — catches a `phc_` key revoked *after* creation (runtime `/batch/` delivery 200s silently and never quarantines on it). Re-probe `/flags/?v=2` per destination on a coarse cadence and quarantine/notify on 401.
- Anything else that needs a Linear issue: file under the **Data destinations** project (`8001ba7f-…`).
