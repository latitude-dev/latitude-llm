# Data destinations — QA runbook

End-to-end manual QA for the PostHog data-destination pipeline (Phase 1 + Phase 2, all merged).
Companion to [`data-destinations.md`](./data-destinations.md). Run this before starting Phase 3.

## Real constants (source: `@domain/destinations/constants.ts`)

| Knob | Value | Notes |
| --- | --- | --- |
| Sweep cadence | every minute (`* * * * *`) | selects *due* destinations |
| Sync interval (default / min / max) | 5 min / 1 min / 60 min | per-destination `config.intervalMs` |
| Safety lag | 5 min | window ends at `now − 5min`; fresh spans don't deliver for ≥5 min |
| Max spans / run | 50k (1k–50k) | `config.maxSpansPerRun` |
| Quarantine threshold | 5 consecutive terminal failures | `DESTINATION_QUARANTINE_FAILURE_THRESHOLD` |
| runSync BullMQ retries | 5 attempts, 30s exponential backoff | exhausting them = **one** terminal failure |
| Idle backoff ceiling | 1 hour | only **empty** runs back off, not failed runs |
| Max event bytes | 1 MiB default | adapter owns the live vendor cap |
| Sync-run retention | 30 days, pruned nightly 03:30 UTC | |

**Timing implication:** with the default 5-min interval, 5 failed runs ⇒ quarantine in ~25 min.
To observe quarantine quickly, set `config.intervalMs = 60000` on the test destination.

## Setup

1. **Stack running:** docker infra + `web`, `workers`, `ingest`. The **sweep only runs if the workers app is up.**
2. **Flag on:** enable `destinations` for the Acme org via `/backoffice` → Feature flags (or enable-for-all in dev). Without it the settings UI is hidden.
3. **PostHog target:** a real PostHog project — note its ingestion host (US `https://us.i.posthog.com` / EU `https://eu.i.posthog.com`) and project API key (`phc_…`).
4. **Seed-traces tool:** `tools/live-seeds`. From that dir: `pnpm seed:live-seeds --list-fixtures`, then e.g.
   `pnpm seed:live-seeds --project-slug <slug> --count-per-fixture 5`. This drives spans into a project's ingest path (it does **not** touch destinations).
5. **Observe results in three places:** PostHog LLM Analytics (events landed), the settings → Data destinations card (status + "last synced … · N events"), and the `destination_sync_runs` Postgres table / worker logs (`destinations.runSync …` lines) for per-run detail.

---

## 0. PostHog invalid-key behavior — RESOLVED (2026-06-16)

Probed both endpoints with a garbage `phc_` key:

- **`/batch/` (runtime delivery)** → `200 {"status":"Ok"}` on US **and** EU, even for an invalid key. Capture is fire-and-forget; PostHog validates asynchronously. **Consequence:** runtime delivery never quarantines on a bad/revoked key — a wrong key silently no-ops (data just never lands). Accepted, by design.
- **`/flags/?v=2` (test-connection)** → `401 authentication_failed` for an invalid key. So the pre-save **test-connection genuinely validates the key** (the deliverer's `testConnection` already probes this endpoint, not `/batch/`). Caveat: the flags endpoint is cache-backed, so it is not a perfectly real-time validity oracle.

**Status:** fine for now. The deliverer's `401/403 → invalid_api_key` mapping is effectively reachable only via `/flags/` (test-connection), not via `/batch/` (delivery). The one residual gap — a key revoked *after* creation stops delivering silently with no quarantine — is acceptable; the deferred fix is an **hourly connection-revalidation sweep** against active destinations (see follow-ups). No QA blocker.

> For quarantine QA, use the **transport-failure** path (§8b) — bad keys will *not* trigger it.

---

## 1. Happy path

- [ ] Create a PostHog destination from settings (region/host + key + name, payloads ON).
- [ ] Seed traces into the project (mix of LLM calls, tool spans, a root span, an embedding).
- [ ] Wait ≥1 interval + safety lag (≈6–10 min, or lower `intervalMs`).
- [ ] In PostHog LLM Analytics, confirm: `$ai_generation`, `$ai_span`, `$ai_trace` (root), `$ai_embedding`.
- [ ] Spot-check props: `$ai_trace_id`/`$ai_span_id`/`$ai_parent_id`, `$ai_session_id` grouping, latency, tokens, **cost in USD** (microcents→USD), `latitude_project_id`/`latitude_span_url`.
- [ ] Card shows `active` + "last synced … · N events"; `destination_sync_runs` row `status=succeeded`.

## 2. Idempotency (most important correctness check)

- [ ] Re-deliver the same window — either re-run the destination over already-synced data, or re-ingest an identical span (same `span_id`).
- [ ] Confirm **zero duplicate events** in PostHog (stable UUIDv5 dedup). Event count must not grow.

## 3. Redaction (`excludePayloads`)

- [ ] Toggle `excludePayloads` ON, seed new traces, sync.
- [ ] In PostHog: `$ai_input`, `$ai_output_choices`, `$ai_input_state`, `$ai_output_state`, `$ai_tools` are null; `$ai_error` shows `error_type` only.
- [ ] Tokens, costs, latency, model/provider, ids, timing **still present**.

## 4. Pause / resume + backlog catch-up

- [ ] Pause an active destination → card `paused`, sweep stops selecting it (no new runs in logs).
- [ ] While paused, seed more traces.
- [ ] Resume → status `active`; subsequent runs catch up the backlog (cursor untouched). Confirm the paused-period spans land in PostHog.

## 5. Idle backoff

- [ ] On a destination with no new traces, watch `destination_sync_runs`: empty runs advance the cursor to window-end, `consecutive_empty_runs` grows, effective interval backs off toward the 1-hour ceiling.
- [ ] Seed new traces → first non-empty run resets the counter; cadence returns to `intervalMs`.

## 6. Oversized event (truncate-then-drop)

- [ ] Ingest a span with a multi-MB payload (> 1 MiB per-event).
- [ ] Confirm the event is content-truncated (`latitude_truncated: true`) or dropped; `events_dropped` counts on the run; **cursor still advances** (destination not wedged).

## 7. SSRF guard

- [ ] Try to create/save a destination with a custom host resolving to a private IP (e.g. `https://127.0.0.1`, `https://169.254.169.254`, internal hostname).
- [ ] Confirm it's rejected (schema and/or runtime in the deliverer); no request leaves the box. Confirm `http://` is rejected (https-only).

## 8. Quarantine

**8a. Bad key (only if §0 returned 4xx):** set an invalid `phc_` key, `intervalMs=60000`. Watch `consecutive_failures` climb each run; at 5 → card `quarantined`, sweep stops selecting it, `last_failure_message` sanitized (status + taxonomy, **no response body**).

**8b. Transport failure (works regardless of §0):** point at an unreachable but public host (a domain that refuses/times out — *not* a private IP, which the SSRF guard rejects differently). Each runSync exhausts its 5 BullMQ retries (~7–8 min of backoff) and counts as **one** terminal failure. Slow — expect this to take a while; lower `intervalMs` and be patient, or drive `runDestinationSync` directly in a script to reach 5.

**8c. Recovery:** edit credentials/host on the quarantined destination → `consecutive_failures` resets, status back to `active`, next sweep picks it up and catches up the backlog.

## 9. Delete cascade

- [ ] Delete the destination → row + its `destination_sync_runs` gone; no more runs.
- [ ] Delete the **project** → confirm `ProjectDeleted` cascade removes the project's destinations + sync runs and the sweep stops selecting them (privacy: residual CH spans must stop being exported).

## 10. Sandbox exclusion

- [ ] In a sandbox / Test Mode org, confirm destination creation is rejected at the use-case boundary, and the sweep's `listDue` never selects sandbox-org destinations.

## 11. Test connection (incl. caveat)

- [ ] Valid key → success; the canary event is visible in the customer's PostHog (confirm copy warns about this).
- [ ] Confirm the UI copy states a valid key for the **wrong project** still "passes" — the test proves reachability + key acceptance, not project identity.

## 12. Hot path untouched (sanity)

- [ ] Confirm no behavioral/latency change to span ingestion while a destination is active (by design — the sweep reads ClickHouse out-of-band; nothing in `apps/ingest` or the span-ingestion worker should be on the destination path).

---

## Findings / follow-ups

- **Deferred:** hourly connection-revalidation sweep against active destinations — catches a `phc_` key revoked *after* creation (runtime `/batch/` delivery 200s silently and never quarantines on it). Re-probe `/flags/?v=2` per destination on a coarse cadence and quarantine/notify on 401.
- Anything else that needs a Linear issue: file under the **Data destinations** project (`8001ba7f-…`).
