# Billing

Billing is application-owned even when Stripe is the self-serve payment processor.

Stripe remains the source of truth for checkout, customer portal, and subscription lifecycle synchronization. Latitude remains the source of truth for plan resolution, included credits, billable action accounting, overage classification, retention entitlements, and runtime enforcement.

## Plans

The canonical billing catalog lives in `@domain/billing`.

Current plan slugs:

- `free`
- `pro`
- `enterprise`

Plan semantics:

- `free`: hard capped, `20,000` included credits, `30` entitlement retention days
- `pro`: overage allowed, `100,000` included credits, `90` entitlement retention days
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
- `billing_usage_events`: append-only billable events with idempotency keys
- `billing_usage_periods`: per-period consumption, overage, reporting progress, and entitlement snapshot state

`billing_usage_periods` is keyed by `(organization_id, period_start, period_end)`, not just by organization. That lets the app hold several historical periods safely and prevents a new cycle from overwriting the previous one.

Each usage period stores:

- `plan_slug`
- `included_credits`
- `consumed_credits`
- `overage_credits`
- `reported_overage_credits`
- `overage_amount_microcents`

`reported_overage_credits` tracks how much of the app-owned overage total has already been pushed to Stripe. The worker only reports the delta.

## Billing Periods

Billing periods are resolved from the effective plan source:

- `free`: current UTC calendar month
- `subscription`: Stripe `periodStart` / `periodEnd`
- `override`: current UTC calendar month unless a future contract model replaces it

## Runtime Metering

Billable runtime work is charged through `meterBillableAction`.

Canonical charge points:

- trace ingest: `apps/workers/src/workers/span-ingestion.ts` after span persistence, once per distinct trace id using `trace:{organizationId}:{projectId}:{traceId}`
- LLM flagger scans: `apps/workflows/src/activities/flagger-activities.ts` before `draftAnnotate`
- live evaluations: `apps/workers/src/workers/live-evaluations.ts` immediately before hosted AI execution
- eval generation: `apps/workflows/src/activities/evaluation-alignment-activities.ts` before expensive alignment generation/optimization work, keyed by `billingOperationId`

Retries must not double-charge. Idempotency is enforced by `billing_usage_events.idempotency_key` and use-case fallback behavior that re-reads the same period snapshot when an event already exists.

## Free Cap Enforcement

Free organizations are hard capped.

Enforcement rules:

- chargeable AI work (`flagger-scan`, `live-eval-scan`, `eval-generation`) is skipped before execution once no credits remain
- ingest is intentionally softer: a coarse pre-check runs before accepting the request, but once accepted, the whole payload is stored and trace usage is computed afterward

That means the final accepted free-plan payload may overshoot slightly. The system never partially accepts only part of one ingest payload.

## Overage Reporting

Paid self-serve plans continue after the included allotment is exhausted.

Overage flow:

1. the usage event is recorded in Latitude's billing tables
2. the period recomputes `overage_credits` and `overage_amount_microcents`
3. if unreported overage exists, `meterBillableAction` publishes `billing.reportOverage`
4. `apps/workers/src/workers/billing.ts` reports only the unreported delta to Stripe and then advances `reported_overage_credits`

The Stripe adapter uses the configured Pro overage price and Stripe billing meter event name. If the overage price item is not already attached to the subscription, the adapter adds it before reporting usage.

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
- action pricing
- self-serve upgrade or billing-portal entry when applicable
- enterprise/manual contract state when applicable

Staff-facing billing support lives in backoffice organization detail.

That surface shows:

- effective plan and source
- Stripe customer/subscription state
- current usage-period summary
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
- overage calculations
- retention entitlements
- manual enterprise overrides
