export {
  AIMeteringScope,
  type AIMeteringScopeShape,
  type MakeAIMeteringScopeInput,
  type MeteredAIAction,
  makeAIMeteringScope,
  provideAIMeteringScope,
  type RecordMeteredAIActionInput,
} from "./ai-metering.ts"
export { billingEnforcementEnabled, selfHostedRetentionDays } from "./config.ts"
export {
  ACTION_CREDITS,
  BILLING_INCLUDED_CREDITS_PG_MAX,
  BILLING_OVERAGE_SYNC_THROTTLE_MS,
  BILLING_SPEND_RESERVATION_TTL_SECONDS,
  buildBillingIdempotencyKey,
  buildBillingOverageDedupeKey,
  CENT_TO_MILLS,
  CHARGEABLE_ACTIONS,
  type ChargeableAction,
  CREDIT_VALUE_MILLS,
  calculateMaxAllowedConsumedCreditsForCap,
  calculateMaxReportableOverageCreditsForCap,
  calculateOverageAmountMills,
  calculatePlanSpendMills,
  creditsForLlmGenerationCost,
  creditsForSemanticQueryCost,
  ENTERPRISE_PLAN_CONFIG,
  FREE_PLAN_CONFIG,
  LLM_GENERATION_BILLING_MARGIN,
  OVERRIDABLE_PLAN_SLUGS,
  OverageCreditUnit,
  type OverridablePlanSlug,
  PLAN_CONFIGS,
  PLAN_SLUGS,
  type PlanConfig,
  type PlanSlug,
  PRO_PLAN_CONFIG,
  persistedIncludedCreditsForPlan,
  SANDBOX_SPAN_RETENTION_DAYS,
  SELF_HOSTED_PLAN_CONFIG,
  SELF_HOSTED_RETENTION_DAYS_MAX,
  SELF_HOSTED_RETENTION_DAYS_MIN,
  SELF_SERVE_PLAN_SLUG_TO_STRIPE_PLAN_NAME,
  SELF_SERVE_PLAN_SLUGS,
  SEMANTIC_QUERY_BILLING_MARGIN,
  SEMANTIC_QUERY_EMBED_USD_PER_MILLION_TOKENS,
  semanticQueryEmbedCostUsd,
} from "./constants.ts"
export {
  type BillingOverride,
  billingOverrideSchema,
} from "./entities/billing-override.ts"
export {
  type BillingOrganizationPlan,
  type BillingPlan,
  billingOrganizationPlanSchema,
  billingPlanSchema,
} from "./entities/billing-plan.ts"
export {
  type BillingUsageEvent,
  billingUsageEventSchema,
} from "./entities/billing-usage-event.ts"
export {
  type BillingUsagePeriod,
  billingUsagePeriodSchema,
} from "./entities/billing-usage-period.ts"
export {
  AIMeteringRecordError,
  BillingConfigurationError,
  InvalidBillingIdempotencyKeyError,
  NoCreditsRemainingError,
  NoSubscriptionFoundError,
  OverageReportFailedError,
  UnknownStripePlanError,
  UsageEventAlreadyRecordedError,
} from "./errors.ts"
export {
  BILLING_LIMIT_KINDS,
  type BillingLimitKind,
  detectBillingLimitCrossed,
} from "./helpers/detect-billing-limit-crossed.ts"
export { BillingOverrideRepository } from "./ports/billing-override-repository.ts"
export {
  BillingSpendReservation,
  type BillingSpendReservationInput,
  type BillingSpendReservationShape,
} from "./ports/billing-spend-reservation.ts"
export { BillingUsageEventRepository } from "./ports/billing-usage-event-repository.ts"
export { BillingUsagePeriodRepository } from "./ports/billing-usage-period-repository.ts"
export {
  type CheckOverageItemInput,
  type RecordOverageMeterEventInput,
  StripeBillingProvider,
} from "./ports/stripe-billing-provider.ts"
export {
  StripeSubscriptionLookup,
  type StripeSubscriptionRow,
} from "./ports/stripe-subscription-lookup.ts"
export {
  type AuthorizeBillableActionInput,
  type AuthorizeBillableActionResult,
  type AuthorizedBillableActionContext,
  authorizeBillableAction,
} from "./use-cases/authorize-billable-action.ts"
export {
  type CheckCreditAvailabilityInput,
  checkCreditAvailabilityUseCase,
} from "./use-cases/check-credit-availability.ts"
export { checkTraceIngestionBillingUseCase } from "./use-cases/check-trace-ingestion-billing.ts"
export {
  type RecordBillableActionInput,
  recordBillableActionUseCase,
} from "./use-cases/record-billable-action.ts"
export {
  type RecordTraceUsage,
  type RecordTraceUsageBatchInput,
  recordTraceUsageBatchUseCase,
} from "./use-cases/record-trace-usage-batch.ts"
export {
  type RecordUsageEventInput,
  recordUsageEventUseCase,
} from "./use-cases/record-usage-event.ts"
export {
  type ReportBillingOverageInput,
  type ReportBillingOverageResult,
  reportBillingOverageUseCase,
} from "./use-cases/report-billing-overage.ts"
export { type EffectivePlanResolution, resolveEffectivePlan } from "./use-cases/resolve-effective-plan.ts"
export { type UpdateSpendingLimitInput, updateSpendingLimitUseCase } from "./use-cases/update-spending-limit.ts"
