# Stripe Plans And Subscriptions

> **Documentation**: `dev-docs/billing.md`, `dev-docs/organizations.md`, `dev-docs/spans.md`, `dev-docs/evaluations.md`, `dev-docs/scores.md`, `dev-docs/reliability.md`, `dev-docs/settings.md`, `dev-docs/authentication.md`

## Spec Contract

This spec defines exactly what to build, how it should be built, and why the billing design is shaped this way.

The spec describes the intended end state for billing and subscriptions while the feature is under construction. Durable future-state knowledge should later be promoted into the referenced `dev-docs/` pages and, if needed, a dedicated billing doc.

## Product Contract

Latitude uses a single credit system.

### Plans

#### Free

- price: `$0 / month`
- included credits: `20,000 / month`
- data retention: `30 days`
- seats: unlimited
- overage: not allowed
- behavior at limit: hard capped

#### Pro

- price: `$99 / month`
- included credits: `100,000 / month`
- data retention: `90 days`
- seats: unlimited
- overage: `$20 / 10,000 credits`
- behavior at limit: usage continues and overage is billed automatically
- optional spending limit: customer-defined total period spend cap, inclusive of the base subscription and metered overage

#### Enterprise

- price: custom
- included credits: custom
- data retention: custom
- seats: custom by contract, but not enforced through the current Better Auth seat path
- overage: custom by contract
- provisioning: manual only, not self-serve
- product entitlements may later include:
  - custom credit volume
  - custom data retention
  - custom on-prem deployment
  - fine-grained RBAC
  - SAML SSO
  - dedicated support

This spec only defines the billing and entitlement foundation for enterprise. It does not imply those product features are already implemented.

### Credit Costs

- `trace = 1 credit`
- `scan = 30 credits`
- `eval generation = 1,000 credits`
- `annotation = 0 credits`

### Chargeable Actions

`scan` means each individual chargeable LLM execution that inspects an existing trace as part of reliability monitoring.

Specifically:

- each LLM flagger run costs `30 credits`
- each live evaluation execution costs `30 credits`
- deterministic flagger runs are free

`eval generation` means each full optimization / alignment run of `optimizeEvaluationWorkflow`, including:

- initial issue-triggered generation
- manual realignment
- automatic re-optimization

Each such run costs `1,000 credits`.

### Dollar Semantics

- included pro credits are priced effectively at `$0.00099 / credit`
- pro overage is priced at `$0.002 / credit`
- embeddings for trace search are priced into the `trace` credit rather than billed separately

## Agreed Decisions

- The system must not infer `paid => pro`. Active Stripe subscriptions must map explicitly to a known self-serve plan slug so future paid plans can be added safely.
- Billing management is allowed for organization `owner` and `admin` roles.
- Enterprise is manual-only and must not appear as a self-serve Stripe checkout option.
- Paid plans reset included credits on the Stripe billing cycle.
- Free plans reset on the calendar month.
- Free-plan ingest should accept a whole payload even if it slightly overshoots the limit; the system must not partially accept only some spans from one request.

## Scope

In scope:

- canonical internal billing catalog for plans, action costs, and effective entitlements
- Stripe checkout / portal wiring for self-serve plans
- application-owned usage metering and idempotent credit accounting
- free-plan hard-cap enforcement
- paid-plan overage accounting and Stripe reporting
- customer-managed Pro spending limits and runtime enforcement
- plan-aware retention configuration across telemetry storage
- organization billing UI in `apps/web`
- backoffice visibility and manual enterprise override controls
- tests for duplicate-delivery safety, plan resolution, period resolution, and cap enforcement

Out of scope:

- implementing SAML, fine-grained RBAC, on-prem deployment, or dedicated support product features
- seat-based billing through Better Auth Stripe's seat synchronization
- changing public API contracts beyond the billing capability needed for this product surface
- historical backfill of already-ingested traces or already-executed reliability actions into billable usage

## Architecture Overview

The billing architecture has four independent concerns:

1. plan and entitlement resolution
2. durable internal usage accounting
3. Stripe subscription and invoice integration
4. runtime enforcement at billable execution boundaries

Better Auth Stripe remains the source of truth for self-serve Stripe subscription synchronization, but it is not the source of truth for included-credit logic, usage metering, free-plan caps, or enterprise overrides.

Those concerns must live in application-owned billing domain code and persistence.

## Plan Resolution

The system must resolve an effective billing plan for every organization.

Resolution order:

1. manual organization billing override
2. active or trialing Stripe self-serve subscription mapped by explicit plan slug
3. fallback to `free`

Important safety rule:

- unknown Stripe subscription plan names must fail closed and log loudly
- they must not silently map to `pro`

This is required so the repo can add future self-serve paid plans without dangerous implicit behavior.

## Canonical Billing Catalog

Add one application-owned billing catalog that defines:

- plan slug
- self-serve vs manual
- included monthly credits
- retention days
- overage policy
- hard-cap policy
- Stripe price mapping for self-serve plans
- chargeable action costs

The billing catalog should be the single source of truth used by:

- Stripe plan configuration passed into Better Auth
- product billing UI
- runtime credit enforcement
- retention stamping
- tests

## Persistence Model

The existing Better Auth `subscriptions` table remains in place for Stripe synchronization.

Add application-owned billing persistence for the parts Stripe does not model for us.

### Organization Billing Overrides

Add an organization-scoped table for manual overrides and enterprise provisioning.

Suggested responsibilities:

- effective plan override
- custom included credits
- custom retention days
- custom overage pricing metadata when needed
- internal notes or provenance for manual enterprise setup

### Billing Usage Events

Add an append-only organization-scoped usage event table.

Each row should contain:

- organization id
- billing period start
- billing period end
- billable action type
- credits consumed
- unique idempotency key
- happened-at timestamp
- metadata payload for debugging and support

This table is the correctness layer for retries and duplicate deliveries.

### Billing Usage Periods

Add a materialized per-period accounting table or equivalent repository abstraction that stores:

- organization id
- plan snapshot for the period
- period start and end
- included credits snapshot
- consumed credits
- overage credits
- overage amount snapshot

The exact storage shape may be one table updated transactionally from the usage-writer path or a derived rollup maintained by domain logic, but the domain must expose a first-class "current usage period" view.

## Billing Period Rules

### Free

- period anchor: calendar month
- period start: first instant of the UTC calendar month unless product requirements later demand org-local time
- period end: first instant of the next UTC calendar month

### Paid Self-Serve

- period anchor: Stripe subscription billing cycle
- the system should use the current subscription's `periodStart` / `periodEnd` data rather than inventing its own month windows

### Enterprise

- default to the configured override contract period
- if enterprise is represented by a manually overridden org without a Stripe-managed contract, the app-owned override must define enough data for the usage-period resolver to function

## Usage Tracking Lifecycle

### 1. Ingested Trace Usage

Recommended meter point: `packages/domain/spans/src/use-cases/process-ingested-spans.ts`.

Why this is the canonical trace charge point:

- the OTLP payload has already been decoded
- the code already has the full `SpanDetail[]`
- the code can compute distinct `traceId`s in the current payload
- the spans have been durably persisted before the charge is recorded
- this path can dedupe traces across multiple ingest requests using a durable idempotency key

Trace usage should not be metered from `trace-end:run` as the canonical source of truth because:

- `trace-end` is a downstream debounced worker path rather than the ingest persistence boundary
- multiple spans for the same trace may cause repeated `SpanIngested` / `trace-end` activity under unusual delivery patterns
- the app can do a more accurate best-effort unique-trace charge at ingest time by examining the persisted payload

Implementation rule:

- after successful span persistence, compute the distinct `traceId`s in that payload
- write one usage event per distinct trace with idempotency key:
  - `trace:{organizationId}:{projectId}:{traceId}`
- each newly inserted key consumes `1 credit`
- repeated ingest for the same trace must no-op rather than double-charge

This handles the case where one real trace arrives across several ingest requests.

### 2. Scan Usage: LLM Flaggers

The canonical charge point for LLM flagger scans is the flagger workflow's chargeable LLM annotate step.

Current flow:

- `trace-end:run` loads one trace and selects downstream work
- deterministic flagger processing runs first in `processFlaggersUseCase`
- deterministic matches write scores directly and are free
- no-match sampled or ambiguous LLM-capable strategies start `flaggerWorkflow`
- inside `flaggerWorkflow`, `draftAnnotate` performs the chargeable LLM generation step

Implementation rule:

- before the LLM draft annotate step executes, record one usage event with idempotency key:
  - `flagger-scan:{organizationId}:{flaggerSlug}:{traceId}`
- each such event consumes `30 credits`
- deterministic matches never create this event

This charges per actual LLM flagger run, which matches the product contract.

### 3. Scan Usage: Live Evaluation Execution

The canonical charge point for live evaluations is the AI execution step in `runLiveEvaluationUseCase`.

Current flow:

- `trace-end:run` selects matching live evaluations
- `orchestrateTraceEndLiveEvaluationExecutesUseCase` publishes one `live-evaluations:execute` task per selected evaluation
- `apps/workers/src/workers/live-evaluations.ts` runs `runLiveEvaluationUseCase`
- `runLiveEvaluationUseCase` loads the evaluation, trace, and issue and performs the hosted AI execution

Implementation rule:

- before the live evaluation AI execution starts, record one usage event with idempotency key:
  - `live-eval-scan:{organizationId}:{evaluationId}:{traceId}`
- each such event consumes `30 credits`

This charges once per actual live evaluation run.

### 4. Eval Generation Usage

The canonical charge point for evaluation generation is `optimizeEvaluationWorkflow`.

Current flow:

- initial generation starts from `startEvaluationAlignment`
- manual realignment starts from `triggerManualEvaluationRealignment`
- automatic re-optimization starts from the `evaluations.automaticOptimization` worker
- all three converge into `optimizeEvaluationWorkflow`

Implementation rule:

- before the expensive AI and GEPA work begins, record one usage event with idempotency key:
  - `eval-generation:{organizationId}:{billingOperationId}`
- each such event consumes `1,000 credits`

The workflow input must carry a dedicated `billingOperationId` rather than reusing a workflow id or evaluation id, because:

- initial generation, manual realignment, and automatic re-optimization are distinct billable runs
- retries within one run must not double-charge
- later runs against the same evaluation must still charge again

## Free Plan Enforcement

### General Rule

Free organizations are hard capped.

Once a free org has exhausted its included credits for the current period, new billable work should not start.

### Ingest Special Case

Trace ingest is intentionally softer than other charge points.

The system should:

- perform a coarse pre-check before accepting a new ingest request
- still accept a whole payload rather than partially dropping traces from it
- record post-persist trace usage events for the truly new traces inside that payload

This means the free plan may slightly overshoot from the final accepted ingest payload. That is acceptable and intentional.

### Scans And Eval Generation

For LLM flagger scans, live evaluations, and eval generation:

- if a free org has no remaining credits, the system should skip the chargeable AI work rather than running it and back-charging later
- the skip path should be explicit and observable in logs / support-facing metadata

## Paid Plan Overage

Paid plans continue running after included credits are exhausted.

The system must:

- continue recording internal usage events after the included allotment is consumed
- classify additional usage as overage within the active billing period
- report the overage quantity to Stripe for automatic billing

Recommended Stripe model:

- keep the base subscription price as the included-credit monthly plan
- attach a metered overage price for excess credits
- report only overage usage to Stripe

Stripe should invoice overage, but the app must remain the source of truth for:

- included credits
- consumed credits
- overage credits
- effective plan entitlements

## Paid Plan Spending Limits

Paid self-serve customers may optionally declare a maximum total spend for one billing period.

For the current rollout, this applies to `pro` only.

The system must:

- store the configured amount as an organization-scoped setting
- interpret it as a cap on `base subscription price + current period overage`
- reject new billable work when the projected period spend would exceed the cap
- allow the cap to be cleared so the org returns to normal overage continuation behavior

Important semantics:

- the minimum valid cap is the Pro base subscription price
- enforcement belongs in the application-owned billing domain, not only in the UI
- ingest remains request-level coarse, just like the free-plan pre-check

## Enterprise Handling

Enterprise is manual-only.

That means:

- enterprise does not appear in self-serve checkout
- enterprise effective plan state comes from application-owned organization billing overrides or a future contract table
- enterprise usage should still be tracked through the same internal usage-event system unless a later contract explicitly requires a different path

## Stripe Integration

### Better Auth Stripe Role

Better Auth Stripe should own:

- checkout session creation for self-serve plans
- customer portal session creation
- webhook-driven subscription synchronization
- storage of Stripe subscription lifecycle data in the Better Auth `subscriptions` table

Better Auth Stripe should not own:

- free-plan logic
- enterprise manual provisioning
- included-credit accounting
- overage calculations
- retention entitlements

### Self-Serve Plan Configuration

Only self-serve plans should be passed as Better Auth Stripe plan definitions.

On initial rollout:

- `pro` is self-serve
- `free` is internal-only
- `enterprise` is manual-only

### Authorization

The current permissive Stripe reference authorization must be replaced.

Billing actions for organization subscriptions and portal sessions must be allowed for:

- `owner`
- `admin`

and denied for:

- `member`

## Retention Entitlements

Current retention is inconsistent with the pricing contract:

- core `spans` and `traces` tables have no TTL today
- `trace_search_documents` has a fixed `90 day` TTL
- `trace_search_embeddings` has a fixed `30 day` TTL

The billing rollout must make retention plan-aware.

Recommended model:

- stamp each persisted telemetry row or search row with the effective `retention_days` for that org at write time
- switch ClickHouse TTL behavior to row-level expressions based on that stamped retention value

This work applies to at least:

- `spans`
- `traces`
- `trace_search_documents`
- `trace_search_embeddings`

## Web Product Surface

Add an organization billing settings surface in `apps/web`.

Minimum UI responsibilities:

- show current effective plan
- show current usage period start and end
- show included credits
- show consumed credits
- show overage credits and projected overage when applicable
- show current spend and any configured Pro spending limit when applicable
- show upgrade CTA for free orgs
- show billing portal CTA for self-serve paid orgs
- show enterprise contact / contract state for enterprise orgs

## Backoffice Surface

Backoffice must expose enough billing state for staff support and enterprise provisioning.

Minimum responsibilities:

- current effective plan
- Stripe customer id and subscription state
- current period usage summary
- current spend and any configured customer-managed spending limit
- manual enterprise override controls
- custom included credits and retention overrides

## Testing Requirements

Highest-risk billing tests are:

- the same trace arriving across multiple ingest requests only charges once
- duplicate queue retries do not double-charge scans
- workflow retries do not double-charge eval generation
- free-plan hard caps block LLM work after exhaustion
- paid plans continue into overage
- Pro spending limits block new billable work once the projected period spend crosses the configured cap
- unknown Stripe plan names fail closed rather than mapping implicitly
- usage period resolution is correct for free and paid plans
- retention stamping feeds the correct TTL behavior

## Tasks

> **Status legend**: `[ ] pending`, `[~] in progress`, `[x] complete`

### Phase 1 - Billing Domain Foundations

- [x] **P1-1**: Create an application-owned billing domain package or equivalent billing module that defines canonical plan slugs, chargeable actions, action costs, retention days, hard-cap rules, and self-serve vs manual plan metadata.
- [x] **P1-2**: Add explicit effective-plan resolution for organizations using the order `manual override -> active/trialing Stripe subscription -> free`.
- [x] **P1-3**: Make unknown Stripe plan names fail closed with support-visible logging rather than mapping silently to `pro`.
- [x] **P1-4**: Define repository ports and domain types for writing idempotent billing usage events and reading current billing-period summaries.

**Exit gate**:

- the repo has a single internal billing catalog and a first-class effective-plan resolver that does not assume every paid plan is `pro`

### Phase 2 - Persistence And Period Resolution

- [x] **P2-1**: Add application-owned organization billing override persistence for enterprise and manual plan overrides.
- [x] **P2-2**: Add append-only billing usage event persistence with a unique idempotency key.
- [x] **P2-3**: Add current-period accounting persistence or repository logic that exposes included credits, consumed credits, overage credits, and period boundaries.
- [x] **P2-4**: Implement period resolution for free calendar-month usage windows.
- [x] **P2-5**: Implement period resolution for self-serve paid plans from Stripe subscription `periodStart` / `periodEnd`.

**Exit gate**:

- the app can persist idempotent billing usage and answer "what plan and period is this org currently on?"
- **⚠️ NOTE**: Drizzle migrations have NOT been generated/run yet — must do `pnpm --filter @platform/db-postgres pg:generate` + `pg:migrate` before integration testing.

### Phase 3 - Stripe Wiring And Authorization

- [x] **P3-1**: Pass explicit self-serve subscription plans into `createBetterAuth` from the web composition root.
- [x] **P3-2**: Add the Better Auth Stripe client plugin to the web auth client.
- [x] **P3-3**: Replace permissive Stripe `authorizeReference` behavior with organization role checks for `owner` and `admin` only.
- [x] **P3-4**: Add server functions for self-serve checkout and billing portal entry for organization billing.
- [x] **P3-5**: Keep enterprise off the self-serve checkout path.

**Exit gate**:

- self-serve billing can be entered safely through Stripe and enterprise remains manual-only

### Phase 4 - Runtime Metering And Enforcement

- [x] **P4-1**: Meter distinct traces in `process-ingested-spans.ts` using per-trace idempotency keys after successful span persistence.
- [x] **P4-2**: Add coarse free-plan pre-checking to ingest while preserving the "accept the full payload" rule.
- [x] **P4-3**: Meter each LLM flagger run before `draftAnnotate` executes.
- [x] **P4-4**: Meter each live evaluation run before the hosted AI execution begins.
- [x] **P4-5**: Add a dedicated `billingOperationId` to eval-generation workflow inputs and meter each `optimizeEvaluationWorkflow` run once.
- [x] **P4-6**: Skip chargeable AI work for exhausted free orgs while keeping deterministic flaggers and free actions unaffected.

**Exit gate**:

- every billable runtime action is charged exactly once per logical run and free-plan enforcement happens at the correct boundaries

### Phase 5 - Overage Reporting And Retention Entitlements

- [x] **P5-1**: Add internal overage classification for paid billing periods once included credits are exhausted.
- [x] **P5-2**: Report overage usage to Stripe using a metered overage price rather than treating Stripe as the included-credit source of truth.
- [x] **P5-3**: Add plan-aware `retention_days` stamping to telemetry and search persistence paths.
- [x] **P5-4**: Update ClickHouse TTL behavior for `spans`, `traces`, `trace_search_documents`, and `trace_search_embeddings` to use plan-aware retention.

**Exit gate**:

- paid overage is billable and retention behavior matches plan entitlements

### Phase 6 - Web And Backoffice Surfaces

- [x] **P6-1**: Add a `/settings/billing` route and settings navigation entry.
- [x] **P6-2**: Show effective plan, current period, included credits, used credits, overage, and spend visibility in the billing UI.
- [x] **P6-3**: Add upgrade and billing-portal actions for self-serve plans.
- [x] **P6-4**: Add enterprise contact / manual-contract state to the billing UI.
- [x] **P6-5**: Add backoffice billing visibility and manual enterprise override controls.

**Exit gate**:

- end users can understand and manage billing, and staff can support enterprise provisioning and billing investigations

### Phase 7 - Test Coverage And Documentation Sync

- [x] **P7-1**: Add tests for trace metering dedupe across repeated ingest requests.
- [x] **P7-2**: Add tests for duplicate queue and workflow retry safety for billable actions.
- [x] **P7-3**: Add tests for free-plan cap enforcement and paid overage continuation.
- [x] **P7-4**: Add tests for plan resolution and Stripe-plan safety.
- [x] **P7-5**: Promote durable knowledge from this spec into `dev-docs/` once the implementation stabilizes.

**Exit gate**:

- the billing system is covered at the correctness boundaries that would otherwise cause double-charging, under-charging, or plan-policy regressions

### Phase 8 - Spending Limits

- [x] **P8-1**: Add an organization-scoped Pro spending-limit setting that can be resolved alongside the effective billing plan.
- [x] **P8-2**: Enforce the spending limit in the application-owned billing domain before new billable usage is recorded.
- [x] **P8-3**: Expose spending-limit controls in `/settings/billing` and show spend-cap visibility in backoffice.
- [x] **P8-4**: Add test coverage for the cap boundary and promote the durable behavior into `dev-docs/`.

**Exit gate**:

- Pro customers can self-serve a per-period spend cap, and billing enforcement blocks new chargeable work once the projected period spend would exceed it

---

## Current Checkpoint (2026-05-05, Phase 8)

### Done (Phases 1-8 complete in code):

**New files created:**

- `packages/domain/billing/` — complete domain package with package.json, tsconfig.json
  - `src/constants.ts` — plan slugs, actions, credits, plan configs, Stripe plan name mapping
  - `src/errors.ts` — `UnknownStripePlanError`, `NoCreditsRemainingError`, `UsageEventAlreadyRecordedError`, `NoSubscriptionFoundError`
  - `src/entities/billing-plan.ts` — `BillingPlan`, `BillingOrganizationPlan` schemas
  - `src/entities/billing-usage-event.ts` — `BillingUsageEvent` schema
  - `src/entities/billing-usage-period.ts` — `BillingUsagePeriod` schema
  - `src/entities/billing-override.ts` — `BillingOverride` schema
  - `src/ports/billing-usage-event-repository.ts` — `BillingUsageEventRepository` port
  - `src/ports/billing-usage-period-repository.ts` — `BillingUsagePeriodRepository` port
  - `src/ports/billing-override-repository.ts` — `BillingOverrideRepository` port
  - `src/ports/stripe-subscription-lookup.ts` — `StripeSubscriptionLookup` port
  - `src/use-cases/resolve-effective-plan.ts` — resolution order: override → subscription → free
  - `src/use-cases/record-usage-event.ts` — `recordUsageEventUseCase`, `checkCreditAvailabilityUseCase`
  - `src/use-cases/meter-billable-action.ts` — combined `meterBillableAction` (resolve + check + record)
  - `src/index.ts`, `src/testing/index.ts`

- `packages/platform/db-postgres/src/schema/billing.ts` — Drizzle tables: `billing_overrides`, `billing_usage_events`, `billing_usage_periods` (all with RLS)
- `packages/platform/db-postgres/src/repositories/billing-override-repository.ts`
- `packages/platform/db-postgres/src/repositories/billing-usage-event-repository.ts`
- `packages/platform/db-postgres/src/repositories/billing-usage-period-repository.ts`
- `packages/platform/db-postgres/src/repositories/stripe-subscription-lookup.ts` — reads from Better Auth `subscriptions` table

- `apps/web/src/domains/billing/billing.functions.ts` — `getBillingOverview` server fn
- `apps/web/src/domains/billing/billing.collection.ts` — `useBilling` hook, `refreshBilling`

**Files modified:**

- `packages/platform/db-postgres/src/index.ts` — added exports for billing repos + stripe lookup
- `packages/platform/db-postgres/package.json` — added `@domain/billing` dep
- `packages/domain/billing/package.json` — added `@repo/observability` dep
- `packages/domain/billing/src/index.ts` — exports `resolveEffectivePlan`, `recordUsageEventUseCase`, `checkCreditAvailabilityUseCase`
- `packages/domain/billing/src/entities/billing-usage-event.ts` — fixed metadata schema typing
- `packages/domain/billing/src/entities/billing-usage-period.ts` — usage periods now track `reportedOverageCredits` and `overageAmountMicrocents`
- `packages/domain/billing/src/errors.ts` — adds `OverageReportFailedError`
- `packages/domain/billing/src/ports/billing-overage-reporter.ts` — Stripe overage reporting port
- `packages/domain/billing/src/use-cases/resolve-effective-plan.ts` — cleaned up `Effect.fn` typing so package typechecks
- `packages/domain/billing/src/use-cases/record-usage-event.ts` — usage periods now snapshot `planSlug` and `includedCredits` instead of defaulting to zero-credit free state
- `packages/domain/billing/src/use-cases/meter-billable-action.ts` — cleaned up `Effect.fn` typing, schedules retryable Stripe overage syncs, and resolves periods by explicit window
- `apps/web/package.json` — added `@domain/billing` dep
- `apps/ingest/package.json` — added `@domain/billing` dep
- `apps/workers/package.json` — added `@domain/billing` dep
- `apps/workflows/package.json` — added `@domain/billing` dep
- `packages/platform/db-postgres/src/create-better-auth.ts` — `authorizeReference` now checks member roles
- `apps/web/src/lib/auth-client.ts` — added `stripeClient()` plugin
- `apps/web/src/server/clients.ts` — imports `PRO_PLAN_CONFIG`, `SELF_SERVE_PLAN_SLUGS`, passes `subscriptionPlans` + Stripe env vars
- `packages/domain/spans/src/use-cases/process-ingested-spans.ts` — added `recordTraceUsage` callback to deps
- `apps/ingest/src/routes/traces.ts` — rejects free-plan ingest once the coarse pre-check sees no credits left
- `apps/workers/src/workers/span-ingestion.ts` — wires billing recording callback via postgres
- `apps/workers/src/workers/billing.ts` — retryable overage sync worker that reports only the unreported Stripe delta and advances `reportedOverageCredits`
- `apps/workers/src/workers/live-evaluations.ts` — meters live evaluation scans immediately before hosted AI execution
- `apps/workers/src/workers/evaluations.ts` — starts optimization workflows with a dedicated `billingOperationId`
- `apps/workers/src/workers/trace-search.ts` — resolves effective retention before writing search documents and embeddings
- `apps/workflows/src/activities/flagger-activities.ts` — `draftAnnotate` does billing check+record before LLM work
- `apps/workflows/src/activities/evaluation-alignment-activities.ts` — adds eval-generation billing gate activity
- `apps/workflows/src/workflows/optimize-evaluation-workflow.ts` — blocks chargeable generation work when billing disallows it
- `packages/domain/spans/src/entities/span.ts` and `packages/domain/spans/src/use-cases/process-ingested-spans.ts` — spans can carry stamped retention days at ingest time
- `packages/platform/db-clickhouse/src/repositories/span-repository.ts` and `packages/platform/db-clickhouse/src/repositories/trace-search-repository.ts` — persist stamped retention onto ClickHouse rows
- `packages/platform/db-clickhouse/clickhouse/migrations/*/*_plan_aware_retention.sql` — adds row-level retention columns and the 30-day storage buffer TTL expressions for spans, traces, and trace-search tables
- `packages/platform/db-postgres/src/repositories/billing-overage-reporter.ts` — Stripe meter-event adapter that lazily attaches the metered overage price to self-serve subscriptions
- `packages/platform/db-postgres/src/repositories/billing-usage-period-repository.ts` and `src/schema/billing.ts` — periods are now keyed by `(organization, periodStart, periodEnd)` instead of a single org row
- `packages/platform/db-postgres/drizzle/20260505052847_phase5-billing-retention/migration.sql` — Postgres migration for overage reporting state
- `.env.example` and `apps/web/src/server/clients.ts` — adds Stripe price/meter env wiring for self-serve base and overage billing
- `packages/domain/queue/src/topic-registry.ts` — adds the retryable `billing.reportOverage` queue contract
- `packages/domain/evaluations/src/use-cases/live/run-live-evaluation.ts` — adds a pre-execution billing hook so metering happens after skip checks but before hosted AI work
- `packages/domain/queue/src/workflow-registry.ts` — includes `billingOperationId` on `optimizeEvaluationWorkflow`
- `apps/web/src/domains/evaluations/evaluation-alignment.functions.ts` — passes `billingOperationId` for initial generation and manual realignment
- `apps/workflows/src/workflows/optimize-evaluation-workflow.test.ts`, `apps/workers/src/workers/evaluations.test.ts`, `apps/workers/src/workers/live-evaluations-execute.test.ts`, `apps/workflows/src/activities/flagger-activities.test.ts` — updated coverage/mocks for the new billing paths
- `apps/workers/src/workers/billing-runtime.test.ts` and `apps/workers/src/workers/span-ingestion.test.ts` — cover plan resolution safety, free-cap blocking, paid overage continuation, duplicate retry safety, and trace metering dedupe across repeated ingest requests
- `dev-docs/billing.md`, `dev-docs/organizations.md`, `dev-docs/settings.md`, and `dev-docs/spans.md` — durable billing model, retention, downgrade, and product-surface documentation
- `AGENTS.md` — repo-wide rule: always create ClickHouse migrations with `ch:create`, never by hand

### Next to continue:

1. **ClickHouse apply step**: run `pnpm --filter @platform/db-clickhouse ch:up` when you want the generated plan-aware retention migration applied locally
2. **Follow-up**: revisit the Better Auth Stripe client-plugin import path. `@better-auth/stripe/client` did not resolve cleanly in the current app/toolchain, so the web billing UI currently calls the Better Auth Stripe endpoints directly instead of using the plugin helper.
