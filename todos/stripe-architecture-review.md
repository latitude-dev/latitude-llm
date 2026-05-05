# Stripe billing branch — architecture review todos

Review baseline: `feat/implement-stripe` vs `main`. Findings reference the repo's own skill rubric (`AGENTS.md` + `.agents/skills/*/SKILL.md`).

Status legend: `[ ]` open · `[x]` fixed · `[~]` accepted exception (won't fix)

---

## HIGH

- [x] **#1 — Postgres schema bypasses required helpers**
  - File: `packages/platform/db-postgres/src/schema/billing.ts:7-58`
  - Rule: `database-postgres` — every PK uses `cuid("id").primaryKey()`; every `createdAt`/`updatedAt` uses `...timestamps()` (which installs `$onUpdateFn`).
  - Symptom: hand-rolled `varchar("id",{length:24}).primaryKey()` on three tables; `billingOverrides` re-declares its own timestamp columns. `updatedAt` will not auto-refresh.
  - Fix: replace with `cuid("id")` and `...timestamps()` helpers; rerun migration generation if needed.

- [x] **#2 — `BillingOverageReporter` port leaks Stripe + Postgres into the domain**
  - File: `packages/domain/billing/src/ports/billing-overage-reporter.ts:12-24`
  - Rule: `architecture-boundaries` — domain ports must be implementation-agnostic.
  - Symptom: `ReportBillingOverageResult` includes the literal `"stripe-not-configured"`; signature requires `SqlClient` in `R`.
  - Fix: rename reason to `"provider-not-configured"`; move `SqlClient` to the adapter layer (the adapter resolves the Stripe subscription internally).

- [x] **#3 — Temporal flagger activity contains business logic and chains 3 separate `Effect.runPromise` calls**
  - File: `apps/workflows/src/activities/flagger-activities.ts:81-172`
  - Rule: `architecture-boundaries` (no logic in activities) + `effect-and-errors` (single composition, typed errors).
  - Symptom: builds idempotency key, runs the authorize Effect, throws raw `new Error("Billing limit reached…")` instead of `NoCreditsRemainingError`, then runs queue-publish + draft as separate `runPromise` calls. OTel span tree severed; queue failure can't roll back authorization.
  - Fix: introduce `executeFlaggerScanUseCase` in `@domain/flagger` (or wherever the flagger domain lives) that authorizes + publishes + drafts inside one Effect; activity becomes `Effect.runPromise(useCase(input).pipe(...))`. Surface `NoCreditsRemainingError` on the typed error channel.

- [x] **#4 — Ingest route races Promise vs Effect with manual `setTimeout`**
  - File: `apps/ingest/src/routes/traces.ts:46-99,131-144`
  - Rule: `architecture-boundaries` (no business logic in handlers) + `effect-and-errors` (cancellation correctness).
  - Symptom: `Promise.race([effectPromise, setTimeoutPromise])` does not cancel the inner Effect. Timeout-loser Effect keeps running, holding Postgres/Redis until natural completion.
  - Fix: encapsulate gate + ingest in a domain use-case using `Effect.timeout(TRACE_INGESTION_BILLING_GATE_TIMEOUT_MS)` and `Effect.catchTag("TimeoutException", () => fail-open)`. Handler becomes validate + `runPromise`.

- [x] **#5 — `processIngestedSpansUseCase` accepts a Promise callback satisfied via `Effect.runPromise`**
  - File: `packages/domain/spans/src/use-cases/process-ingested-spans.ts:152-159,204-214`; worker at `apps/workers/src/workers/span-ingestion.ts:52-101`.
  - Rule: `architecture-boundaries` — domain depends on ports only. `effect-and-errors` — typed Effect composition, never inner `runPromise`.
  - Symptom: `recordTraceUsage` typed `Promise<void>`; worker satisfies it by re-entering `Effect.runPromise(...)` per call. Severs OTel span tree, swallows typed errors, re-installs `withTracing`/`QueuePublisher` per call.
  - Fix: replace the Promise callback with a real domain port (`BillingTraceUsagePublisher` or similar) returning `Effect<void, QueuePublishError, QueuePublisher>`. Provide live layer once; `yield*` it inline so spans nest.

- [x] **#6 — Backoffice billing handlers contain logic that should live in `@domain/admin`**
  - File: `apps/web/src/domains/admin/organizations.functions.ts:167-283`
  - Rule: `backoffice` — handler is "guard, validate, route to use-case, map to DTO."
  - Symptom: `adminGetOrganizationBilling` composes `resolveEffectivePlanCached` + 3 repo reads + DTO assembly inline. `adminUpdateOrganizationBillingOverride` constructs the entity (`id ?? generateId()`, copy `createdAt`), upserts, invalidates cache — all in the server function.
  - Fix: add `packages/domain/admin/src/billing/` with `get-organization-billing.ts`, `upsert-billing-override.ts`, `clear-billing-override.ts` use-cases. Server functions become thin.

- [x] **#7 — `updateBillingSpendingLimit` server function carries domain logic**
  - File: `apps/web/src/domains/billing/billing.functions.ts:88-157`
  - Rule: `architecture-boundaries`.
  - Symptom: admin-membership check, plan-eligibility, dollars→cents conversion, minimum-price validation, settings-merge — inline.
  - Fix: extract to `@domain/billing/use-cases/update-spending-limit.ts`; handler becomes validate + run + invalidate.

- [~] **#8 — `Span` entity gained a billing field (`retentionDays`)** — *accepted exception*
  - File: `packages/domain/spans/src/entities/span.ts`.
  - Decision: keep as-is. (Won't fix per user.)

- [x] **#9 — `BillingOverageReporterLive` reads env via `Effect.runSync(parseEnvOptional(...))` at layer build**
  - File: `packages/platform/db-postgres/src/repositories/billing-overage-reporter.ts:18-22`
  - Rule: `architecture-boundaries` — env reads inside the Effect pipeline, not eagerly at module load.
  - Fix: move `parseEnvOptional` calls inside an `Effect.gen` that the layer composes; cache the resolved client.

- [~] **#10 — `billing-overage` task payload omits `projectId`** — *accepted exception*
  - File: `packages/domain/queue/src/topic-registry.ts:281-287`.
  - Decision: billing-overage is intentionally org-scoped, not project-scoped. Add to the documented exception list when convenient.

---

## MEDIUM (not in scope of this pass)

- [x] **#11** Duplicate `BILLING_OVERAGE_SYNC_THROTTLE_MS = 60_000` in `record-billable-action.ts:8` + `record-trace-usage-batch.ts:11` → move to `@domain/billing/constants.ts`.
- [x] **#12** `@domain/billing/testing` re-exports public surface instead of fakes — delete or replace with real fakes.
- [x] **#13** `findBy*` ports return `Entity | null` instead of failing with `NotFoundError`. Affected: `BillingOverrideRepository.findByOrganizationId`, `BillingUsageEventRepository.findByKey`, `BillingUsagePeriodRepository.findByPeriod`/`findCurrent`, `StripeSubscriptionLookup.findActiveByOrganizationId`. Either rename to `findOptional…` or fail with `NotFoundError`.
- [x] **#14** `BillingUsagePeriodRepository.findCurrent(_organizationId)` ignores its parameter — `packages/platform/db-postgres/src/repositories/billing-usage-period-repository.ts:190-209`.
- [x] **#15** Plan-slug literals re-declared inline in `resolve-effective-plan.ts:14,22`, `authorize-billable-action.ts:12,39`, `record-billable-action.ts:13`, etc.; reuse `PlanSlug` from `@domain/billing/constants`.
- [x] **#16** Span-ingestion worker swallows `recordTraceUsage` failures (`apps/workers/src/workers/span-ingestion.ts:90-100` + `Effect.ignore` in `process-ingested-spans.ts:212-214`). Use `Effect.either`, emit metric, or write outbox.
- [x] **#17** `recordBillableAction` / `recordTraceUsageBatch` use `.pipe(Effect.ignore)` after publish — silent loss if BullMQ publish fails.
- [x] **#18** Backoffice `BillingOverrideSection` and settings `SpendingLimitSection` use ad-hoc `useState` — convert to `useForm` + `createFormSubmitHandler` + `fieldErrorsAsStrings`.
- [x] **#19** Frontend posts directly to Better Auth Stripe routes via raw `fetch` (`apps/web/src/routes/_authenticated/settings/billing.tsx:68-83,144-185`) — wrap in server functions.
- [ ] **#20** Adapter decides "auto-attach overage price item if missing" (`billing-overage-reporter.ts:87-100`) — billing-policy decision in a Postgres adapter; move to domain use-case.

## LOW (not in scope of this pass)

- [ ] **#21** `dedupeKey` template repeated verbatim in `record-billable-action.ts:55` + `record-trace-usage-batch.ts:113` → `buildBillingOverageDedupeKey(...)`.
- [ ] **#22** Domain logs `alert: true` in `resolve-effective-plan.ts:73-79` — let the boundary log; domain emits typed errors + span annotations.
- [ ] **#23** `parseCachedPlan` hand-rolls ~50 lines of `typeof` validation in `resolve-effective-plan-cached.ts:9-64` — use `billingOrganizationPlanSchema.safeParse`.
- [ ] **#24** `* 1_000_000` literals in `authorize-billable-action.ts:80,82` + `record-usage-event.ts:133,135` — use `CENT_TO_MICROCENTS`.
