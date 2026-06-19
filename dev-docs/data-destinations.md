# Data destinations

**Data destinations** forward a customer's telemetry out of Latitude and into systems they own — analytics tools, data warehouses, object storage. The capability is outbound, continuous synchronization: a customer connects a destination to a Latitude project and new telemetry keeps flowing to it within minutes, with no manual exports.

PostHog LLM Analytics is the first destination. The design is deliberately **destination-agnostic** and **source-agnostic**: adding a new destination (Mixpanel, generic webhook, S3/Parquet file-drop) or a new source (scores, signals) means a new adapter or mapper, not a new pipeline.

This is distinct from internal product analytics (our own write-only, single-tenant telemetry). Destinations are multi-tenant: each carries the customer's own credentials and writes only to the system they connected.

## How it works at a glance

Delivery is a **scheduled micro-batch pull**, not per-event push:

1. A repeatable **sweep** ticks every minute and selects destinations (and their sources) that are due to run, based on when they last ran and their configured interval.
2. For each due source it enqueues a **sync run**. A run reads a window of new records, maps them to the destination's event shape, delivers them, and advances a cursor.
3. The cursor only ever advances past data that was **fully delivered**, so a failure simply retries the window — never skips it, never duplicates it.

This keeps the span-ingestion hot path completely untouched: destinations read settled data on their own schedule and add no latency or coupling to ingestion.

### Why pull, not push

The ingest path stays untouched; stored records settle eventually (they are written asynchronously), so a watermark with a small **safety lag** reads settled data instead of racing the writers; and reading by an *ingestion* timestamp (not an event timestamp) catches late-arriving records. This is also what the market ships — competitors deliver on scheduled intervals or batch windows, not realtime tees.

## Core pieces

| Piece | Role |
| --- | --- |
| **Destination** | A customer-owned target connected to one project: its kind (e.g. PostHog), non-secret config (host, interval), encrypted credentials, and health status. Project-scoped; N per org; dies with its project. |
| **Source** | What telemetry a destination reads (today: spans). Each `(destination, source)` pair owns its own cursor, per-source config, schedule, and idle state — sources progress independently. |
| **Sync run** | One audited execution over one window: its bounds, counts (records read, events sent/dropped), status, and a sanitized error. Powers the "last synced … · N events" UI and debugging; pruned after 30 days. |
| **Mapper** | Pure transform from source records to a destination's event shape. Per `(source × destination kind)`. |
| **Deliverer (adapter)** | The transport to a specific destination: how to send, how to chunk, how to map transport signals to retryable/non-retryable errors, and any vendor-specific mechanics. |
| **Sweep + worker** | The scheduler (due-selection, fan-out) and the run executor (window math, delivery, cursor advance, failure policy). |

### Engine vs. adapter — the key boundary

The **engine** is destination-agnostic. It owns scheduling, window math, cursor advancement, idempotency, failure/quarantine policy, idle backoff, and backfill governance. It never knows vendor specifics.

The **adapter** owns everything vendor-specific: how to deliver, what a given transport signal *means* (e.g. "this status means throttled"), and how to translate delivery context into vendor mechanics. The engine hands each delivery a neutral context (the window being delivered, hence its age); the adapter derives its own behavior from it.

A registry maps each destination kind to its adapter, exhaustively and type-checked, so adding a kind is additive.

## Idempotency

Delivery is **at-least-once with deterministic identity**, which the destination turns into effectively-once. Each event gets a stable, deterministic identifier derived from the destination, the record, and the event type, plus stable timestamp and attribution across retries. Re-delivering the same record produces the same identifier, so retries and overlapping windows dedup to no-ops at the destination.

This is correct **only because the source is append-only and immutable** (spans are write-once). A mutable source would need version-aware identity instead — see the source contract below.

The cursor is **compound** (an ingestion timestamp plus a tie-breaker id) because many records can share the same ingestion timestamp. The window reads strictly after the cursor pair, so a run that stops mid-batch (cap or chunk boundary) never skips same-timestamp siblings. Cursor writes are optimistic — a stale concurrent run can't move the cursor backward or double-advance.

## PostHog destination

PostHog LLM Analytics consumes native `$ai_*` events. The mapping reads **spans only**:

- A span becomes `$ai_generation` (LLM call), `$ai_embedding`, or `$ai_span` (any other step).
- A **root span** additionally emits `$ai_trace`, so the trace view is populated.
- Trace and session structure travel as **event properties** (each event carries its trace and session id), so PostHog reconstructs traces and sessions without separate events. We never read the derived trace/session tables — spans are the source of truth.

Because a root span emits two events, run accounting is `events sent = spans read + root spans` — the gap is the trace count, not duplication.

Vendor mechanics that live in the PostHog adapter (not the engine): flagging old windows as a historical migration so backfills don't trip spike detection; chunked delivery within size limits; mapping transport status to retryable vs. non-retryable; and an SSRF guard on custom hosts (https-only, public-IP resolution at request time, no redirects).

**Known limit:** PostHog `phc_` keys are write-only. Delivery to a *valid key for the wrong project* succeeds and silently lands data in that other project — reachability and key acceptance are verifiable, project identity is not.

## Reliability behaviors

- **Quarantine on chronic failure.** A destination that accumulates consecutive terminal failures (default threshold: 5) is quarantined and stops being scheduled, so a decommissioned target doesn't retry forever. Editing credentials or host resets it. Quarantine and credentials are **destination-level** (shared across its sources); per-run faults like a mapping error are not grounds for quarantine.
- **Throttle ≠ broken.** A rate-limited response (HTTP 429) means "slow down," not "broken," so it must not count toward quarantine. Delivery errors carry a generic, destination-agnostic reason **category** (`rate_limited | server_error | transport | auth | config`), with the vendor-specific code in a separate `detail` field for the message/UI. A terminal failure whose category is `rate_limited` fails its window (cursor untouched) and the sweep re-enqueues next interval, but never increments the failure counter — a healthy destination being throttled is retried until it catches up, not quarantined. The throttle-vs-quarantine decision lives in the **engine**, keyed off the category, so a second adapter inherits it by mapping its own 429s to `rate_limited`; the PostHog adapter additionally honors `Retry-After` and re-sends a throttled chunk in-transport a few times before deferring to the queue.
- **Idle backoff.** A source that reads zero records backs off exponentially (`interval × 2^consecutive_empty_runs`, capped at an hourly ceiling), resetting to full cadence on the first non-empty run. The point is **cost**: a configured-but-dormant project (customer stopped sending traces but kept the destination) would otherwise cost an empty ClickHouse window-scan *every interval forever* — ~288/day at the 5-min default — just to re-confirm "still nothing." Backoff cuts a dead project to ~24/day (one probe/hour, a >10× reduction) while an active project, which never reads empty, pays nothing. The tradeoff is **wake-up latency**: when a dormant project resumes, its first new data waits up to the ceiling (plus safety lag) for the next scheduled probe to discover it — bounded by design. Forcing an immediate pickup means resetting `consecutive_empty_runs` to 0. A future `TracesIngested` consumer that resets the backoff the instant new data arrives would erase even that latency (see open questions).
- **Payload exclusion.** A per-source toggle nulls *all* content-bearing fields (inputs, outputs, tool definitions, error messages → error type only) in one pass, while metrics, cost, ids, and timing always flow. Off by default (content is the product value); present from day one because it's a compliance blocker for some customers. This is field exclusion, not PII redaction.
- **Oversized events.** An event over the per-event size limit has its content truncated (and is marked as such); if still too large it's dropped and counted. The cursor always advances — one giant record can never wedge a destination forever.
- **Sandbox exclusion.** Sandbox/Test Mode organizations cannot create destinations and are filtered out of scheduling — sandbox data never leaves the platform.

## Backfill

New destinations start at creation time and advance forward. A **backfill** exports historical windows, bounded *above* by the lower edge of what live sync already covers, so it never re-sends data the live path owns. Coverage extends leftward only and advances only when a whole window chain drains, so a partial failure never claims undelivered coverage. Reach is bounded by the org's retention window — backfilling past it is pointless (that data is already expired).

The binding concern for backfill is **resource footprint, not reach**: a single backfill is gentle (one window in flight) but can hold a worker slot and steady reads for days on a large project. Governance, not raw speed, is the lever:

- A **budgeted low-priority lane** (a separate queue at low concurrency) so backfill can never starve live sync or other orgs.
- A **hard one-chain-per-source guard** (atomic claim) so racing triggers can't double-run.
- **Failure is visible**: a terminal backfill failure writes an audit row and clears the in-flight marker, so a dead chain doesn't vanish silently.

Processing is **oldest-first** and must outrun retention deletion; this only risks data loss for the extreme tier where ingest rate exceeds backfill throughput.

## Multi-source design (the source contract)

The engine is built on spans' three properties: **append-only, immutable, write-once**. The scheduling/cursor/quarantine/backoff machinery is source-agnostic and unchanged for any new source. A source may feed a destination only if it presents as a **monotonic-watermark change-log**:

- **Watermark.** The cursor generalizes from an ingestion timestamp to any monotonic per-row column; a mutable source would use an "updated at" column so updated rows re-enter a later window.
- **Deletes ⇒ soft-delete is mandatory.** A watermark sweep is blind to a hard delete (the row is just gone). Any mutable source must soft-delete so a deletion becomes a tombstone update the watermark catches. Snapshot/diff reconciliation is explicitly rejected — too expensive for the cheap cursor model.
- **Version-aware idempotency.** The deterministic-identity trick is correct only for immutable content. A mutable source must either emit distinct append-only change events or map to a last-write-wins upsert primitive — a decision that lives in the mapper/adapter, never the engine.

The read/cursor/scheduling half of multi-source is **done** (the engine runs per `(destination, source)`); spans remain the only wired source. The genuinely-mutable half (a change-set deliverer with upsert/delete operations) is additive and waits for the first mutable source, which is itself blocked on that source gaining soft-deletes.

## Operational constants

| Knob | Value |
| --- | --- |
| Sweep cadence | every minute |
| Sync interval (default / min / max) | 5 min / 1 min / 60 min |
| Safety lag | 5 min (window ends at `now − 5min`) |
| Max records per run | 50k (range 1k–50k) |
| Quarantine threshold | 5 consecutive terminal failures (destination-level) |
| Run retries | 5 attempts, exponential backoff (exhausting them = one terminal failure) |
| Idle backoff ceiling | 1 hour (per source) |
| Idle auto-pause | after 168 consecutive empty runs (≈ 7 days of inactivity) |
| Sync-run retention | 30 days, pruned nightly |

A dev-only override shortens the safety lag for fast local testing.

> **Asserting idempotency:** PostHog's dedup is **eventual** (a background merge that can take days), so immediately after a re-sync the raw row count *does* show transient duplicates. The real-time correctness signal is that **distinct event identifiers don't grow** for re-delivered records — assert on distinct-UUID count, not raw count.

## Creation surface

Destinations are created **only** through the project-settings UI — a deliberate, scoped exception to the "machine-facing by default" principle, because connecting a customer write-key is an operator action, not an agent capability. There is no public API/MCP/CLI creation path. Stopping a destination is a **pause** (available to the customer and to operators), not a flag flip.

## Open questions

- **Backfill throughput constants.** The throughput model rests on an unmeasured per-delivery latency constant; re-measuring it against a high-volume project is the prerequisite to committing to further mitigation.
- **Self-serve backfill cap.** What's the default volume above which a one-click backfill becomes paced-background or ops-gated rather than self-serve?
- **Whale full-retention policy.** Is full-retention backfill for the largest enterprise tiers a product promise, or best-effort most-recent-N with clear messaging?
- **Backfill concurrency.** Is concurrency a flat system budget or a product knob (enterprise buys more lane)?
- **Silent credential revocation.** A key revoked *after* creation stops delivering silently (delivery is fire-and-forget and won't quarantine on a bad key). The deferred fix is a periodic connection-revalidation sweep.
- **Ingest-lag alarm.** Records that become visible *behind* the watermark are lost to all destinations silently; this needs an alarm when ingestion-queue lag approaches the safety lag.
- **Instant idle-backoff reset.** A dormant project's first new data waits up to the hourly ceiling for the next scheduled probe to discover it. A `TracesIngested` consumer that resets `consecutive_empty_runs` the instant new data arrives would erase that wake-up latency.
