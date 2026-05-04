# Billing

Billing is application-owned even when Stripe is the self-serve payment processor.

Stripe remains the source of truth for checkout, customer portal, and subscription lifecycle synchronization. Latitude remains the source of truth for plan resolution, included credits, billable action accounting, overage classification, spend-cap enforcement, retention entitlements, and runtime enforcement.

## Plans

The canonical billing catalog lives in `@domain/billing`.

Current plan slugs:

- `free`
- `pro`
- `enterprise`

Plan semantics:

- `free`: hard capped, `20,000` included credits, `30` entitlement retention days
- `pro`: overage allowed, `100,000` included credits, `90` entitlement retention days, optional customer-managed period spending cap
- `enterprise`: manual-only, override-driven included credits and retention by contract

Chargeable actions:

- `trace = 1 credit`
- `flagger-scan = 30 credits`
- `live-eval-scan = 30 credits`
- `eval-generation = 1,000 credits`

## Effective Plan Resolution

Every organization resolves to one effective billing plan in this order:

1. manual organization billing override
2. active or trialing Stripe self-serve subscription mapped by explicit plan slug
3. fallback to `free`

Unknown Stripe plan names fail closed through `UnknownStripePlanError`. The billing domain must never infer `paid => pro`.

## Persistence Model

Better Auth's `subscriptions` table remains the synchronized Stripe-subscription mirror.

Latitude-owned billing persistence covers the parts Stripe does not model for us:

- `billing_overrides`: manual enterprise / support overrides
- `billing_usage_events`: append-only billable event ledger with period-scoped idempotency keys, range-partitioned by `billing_period_start`
- `billing_usage_periods`: per-period consumption, overage, reporting progress, and entitlement snapshot state
- `organizations.settings.billing.spendingLimitCents`: optional Pro spend cap chosen by the customer for the current and future billing periods

Postgres is the authoritative store for metered billing usage. This is intentional even though trace telemetry lives in ClickHouse: billing requires write-time idempotency (`UNIQUE(billing_period_start, idempotency_key)` plus `ON CONFLICT DO NOTHING`) so retries and duplicate trace ingestion for the same resolved billing period cannot double-count. Moving the authoritative ledger to ClickHouse would either require high-cardinality read-time deduplication by idempotency key on every reporting run or accept duplicate billing risk. Postgres owns the short-lived billing ledger and period counters; ClickHouse owns telemetry analytics.

`billing_usage_events` is retained for `60` days. After that window, finalized Stripe invoices and `billing_usage_periods.reported_overage_credits` are the durable billing record. Postgres does not have a native TTL clause like ClickHouse, so the table is range-partitioned by `billing_period_start`; old partitions are dropped instead of deleting row-by-row. Idempotency is scoped to `(billing_period_start, idempotency_key)` because Postgres unique constraints on partitioned tables must include the partition key. Do not use `TRUNCATE` for TTL retention because it removes all rows, including current-period idempotency keys.

Partition maintenance lives in database functions created by the billing partition migration. Run `pnpm --filter @platform/db-postgres billing:usage-events:maintain` on a daily operational schedule to ensure future monthly partitions exist and drop partitions whose full billing-period month is older than the `60` day retention window.

`billing_usage_periods` is keyed by `(organization_id, period_start, period_end)`, not just by organization. That lets the app hold several historical periods safely and prevents a new cycle from overwriting the previous one.

Each usage period stores:

- `plan_slug`
- `included_credits`
- `consumed_credits`
- `overage_credits`
- `reported_overage_credits`
- `overage_amount_mills`

`overage_amount_mills` stores thousandths of a dollar (`1 = $0.001`) so the Pro overage rate of `$0.002` per credit is represented exactly as `2` mills per credit without using microcent precision.

`reported_overage_credits` tracks how much of the app-owned overage total has already been pushed to Stripe. The worker only reports the delta.

## Billing Periods

Billing periods are resolved from the effective plan source:

- `free`: current UTC calendar month
- `subscription`: Stripe `periodStart` / `periodEnd`
- `override`: current UTC calendar month unless a future contract model replaces it

## Runtime Metering

Billable runtime work is charged through a two-step billing flow: authorize first when the action can still be avoided, then record an append-only usage event once the logical action has happened.

Trace ingestion splits enforcement (HTTP) from attribution (worker):

1. **Admission — `apps/ingest`**: `/v1/traces` resolves the effective plan, runs `checkCreditAvailabilityUseCase` (including **`hardCapped` for Free**), and returns **`402`** when the request itself would overshoot allowances. This gate has a short timeout and fails open on degradation so ingest durability wins over temporary billing dependency issues.
2. **Attribution — `span-ingestion` -> `domain-events` -> `billing` workers**: After spans are durable, the span worker emits `TracesIngested` with a billing snapshot for the resolved plan and period. The domain-events worker fans that into `billing:recordTraceUsageBatch`, and the billing worker meters each distinct `{organizationId, projectId, traceId}` exactly once using `buildBillingIdempotencyKey("trace", …)`.
3. **Trace micro-batching**: the billing worker coalesces trace-usage jobs for the same `{organizationId, periodStart, periodEnd, planSlug, planSource, includedCredits, overageAllowed}` over a `250ms` flush window, or until the pending group reaches `5,000` traces. The batch can include traces from multiple projects because project identity is carried on each trace usage. This reduces hot `billing_usage_periods` row updates while bounding trace-counter lag to the flush window. Expensive AI actions are not batched because they must authorize and reserve spend before execution.
4. **Persistence semantics**: `recordTraceUsageBatchUseCase` inserts append-only usage events with `ON CONFLICT DO NOTHING` on `(billing_period_start, idempotency_key)`, then advances `billing_usage_periods` atomically through `appendCreditsForBillingPeriod` by the number of newly inserted events in the flush. Parallel trace batches therefore preserve correct counters even under concurrent workers.
5. If metering fails **after persistence**, ingest remains available (prioritize telemetry durability): log loudly with org/project/trace context and reconcile or retry idempotently out-of-band—the same trace key stays idempotent once billing dependency is healthy again.

Canonical charge points:

- trace ingest metering: `apps/workers/src/workers/span-ingestion.ts` emits `TracesIngested`, `apps/workers/src/workers/domain-events.ts` routes billing work, and `apps/workers/src/workers/billing.ts` records once per distinct trace id using `trace:{organizationId}:{projectId}:{traceId}`
- LLM flagger scans: `apps/workflows/src/activities/flagger-activities.ts` before `draftAnnotate`
- live evaluations: `apps/workers/src/workers/live-evaluations.ts` immediately before hosted AI execution
- eval generation: `apps/workflows/src/activities/evaluation-alignment-activities.ts` before expensive alignment generation/optimization work, keyed by `billingOperationId`

Retries must not double-charge. Idempotency is enforced by `billing_usage_events` on `(billing_period_start, idempotency_key)` and use-case fallback behavior that re-reads the same period snapshot when an event already exists.

## Free Cap Enforcement

Free organizations are hard capped.

Enforcement rules:

- chargeable AI work (`flagger-scan`, `live-eval-scan`, `eval-generation`) is skipped before execution once no credits remain
- ingest: the **ingest HTTP route** rejects over-limit payloads with **`402`**. Accepted payloads persist first; metering runs afterward inside the ingest worker (`402` semantics use `NoCreditsRemainingError` aligned with metering domain errors).

The system never partially accepts only part of one ingest payload. Do **not** bypass the ingest billing gate—other producers must enqueue `span-ingestion` only after applying the **same credit checks**.

## Pro Spending Limits

Pro organizations may optionally set `organization.settings.billing.spendingLimitCents` from `/settings/billing`.

The spend cap semantics are:

- it applies only to effective `pro` plans
- it is measured per billing period, using the same Stripe subscription period as Pro credit accounting
- it includes the fixed Pro base subscription price plus the current period's metered overage amount
- the minimum valid cap is the Pro base subscription price, because the base subscription is always billable once the organization is on Pro
- clearing the setting removes the cap and restores normal overage continuation behavior

Enforcement happens inside `authorizeBillableAction`, not in the UI. Before a new billable event is recorded, the billing domain projects the resulting period spend and blocks the action when that projection would exceed the configured cap.

This applies to the same charge points as normal billing metering:

- trace ingest pre-checks
- LLM flagger scans
- live evaluations
- eval generation

Two layers of enforcement run in `authorizeBillableAction`:

1. **Snapshot projection (Postgres)**: reads the current period's `consumedCredits`, computes the projected spend with this action included, and refuses immediately if the projection already exceeds the cap. This catches the simple sequential case.
2. **Atomic spend reservation (Redis)**: when the caller supplies an `idempotencyKey`, the use-case asks the `BillingSpendReservation` port to reserve `creditsRequested` against an in-memory counter for the period, refusing if the resulting reservation total would exceed the cap. The Redis adapter runs this as a single Lua script so concurrent `live-eval-scan` and `flagger-scan` callers cannot all race past the snapshot check at the cap boundary. The same `idempotencyKey` reused on retry is a no-op success — matching the period-scoped Postgres usage-event idempotency semantics so worker retries don't double-reserve.

The reservation counter is initialized lazily from the Postgres `consumedCredits` snapshot when the key is missing, so a fresh period or a Redis cold start re-syncs to the authoritative value. The counter is not decremented when the worker writes to Postgres — the reservation already counts that consumption — and the period TTL evicts the key after rollover.

Like the free-plan ingest cap, trace ingestion remains intentionally coarse at the request boundary: the ingest API blocks clearly over-limit requests before accepting them, while already accepted payloads are still metered after persistence. Trace ingest does not use the spend-reservation port; it uses `checkCreditAvailabilityUseCase` against the snapshot only, on the basis that one-credit traces accumulating slightly over the cap is acceptable.

## Overage Reporting

Paid self-serve plans continue after the included allotment is exhausted.

Overage flow:

1. the usage event is recorded in Latitude's billing tables
2. the period recomputes `overage_credits` and `overage_amount_mills`
3. recording usage writes the `BillingUsagePeriodUpdated` outbox event with the latest `overage_credits` and `reported_overage_credits`
4. the domain-events worker publishes `billing-overage:reportOverage` only when the effective source is `subscription` and unreported overage still exists; this job is latest-throttled so hot ingestion replaces the pending snapshot without extending the reporting window
5. `apps/workers/src/workers/billing-overage.ts` starts `billingOverageWorkflow` with the captured snapshot
6. `apps/workflows/src/activities/billing-overage-activities.ts` reports only the unreported delta to Stripe and then advances `reported_overage_credits`

The Stripe adapter uses the configured Pro overage price and Stripe billing meter event name. If the overage price item is not already attached to the subscription, the adapter adds it before reporting usage.

If a Pro spend cap is configured, overage reporting is clamped before Stripe sees it. The workflow computes the maximum overage credits that can be reported while keeping `base subscription + metered overage <= spendingLimitCents`, then reports at most that cumulative overage amount. If trace ingestion slightly overshoots because the request-boundary check is intentionally coarse, Latitude eats that small excess; Stripe is not sent meter events that would make the customer pay above the configured spending limit. Expensive billable AI actions still use `authorizeBillableAction` and Redis reservation to block before execution.

## Retention Entitlements

Telemetry and trace-search rows are stamped with the effective plan retention at write time:

- span ingest stamps `retention_days` onto `spans`
- trace search stamps `retention_days` onto `trace_search_documents` and `trace_search_embeddings`
- the `traces` materialized view carries forward `max(retention_days)` from its source spans

ClickHouse TTL enforces physical deletion with a `30` day storage grace buffer:

- `spans`: `start_time + (retention_days + 30 days)`
- `traces`: `min_start_time + (retention_days + 30 days)`
- `trace_search_documents`: `start_time + (retention_days + 30 days)`
- `trace_search_embeddings`: `start_time + (retention_days + 30 days)`

The entitlement value and the physical deletion threshold are intentionally different. The extra `30` day buffer exists so an organization that has fallen past its contracted retention can still upgrade before the data is physically removed.

Retention is stamped at write time, not recomputed retroactively. If an organization downgrades from Pro to Free:

- rows written while the org was on Pro keep `90` stamped retention days
- rows written after the downgrade get `30` stamped retention days

## Product Surfaces

User-facing billing management lives at `/settings/billing`.

That surface shows:

- effective plan and plan source
- current billing period
- included credits
- consumed credits
- overage credits and amount
- current period spend for priced plans
- optional Pro spending-limit controls and remaining headroom
- self-serve upgrade or billing-portal entry when applicable
- enterprise/manual contract state when applicable

Staff-facing billing support lives in backoffice organization detail.

That surface shows:

- effective plan and source
- Stripe customer/subscription state
- current usage-period summary
- current spend and any customer-managed Pro spend cap
- current override state
- manual override controls for plan, included credits, retention, and notes

## Stripe Boundaries

Better Auth Stripe owns:

- checkout session creation
- billing-portal session creation
- Stripe webhook synchronization into `subscriptions`

Latitude billing code owns:

- explicit plan mapping from Stripe plan name to internal plan slug
- credit accounting
- free-cap enforcement
- Pro spend-cap enforcement
- overage calculations
- retention entitlements
- manual enterprise overrides
