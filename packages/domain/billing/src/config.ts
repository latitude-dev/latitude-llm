import { parseEnv } from "@platform/env"
import { Effect } from "effect"
import { SELF_HOSTED_PLAN_CONFIG, SELF_HOSTED_RETENTION_DAYS_MAX, SELF_HOSTED_RETENTION_DAYS_MIN } from "./constants.ts"
import { BillingConfigurationError } from "./errors.ts"

// ---------------------------------------------------------------------------
// Deployment billing configuration (LAT_BILLING_ENABLED, LAT_TELEMETRY_RETENTION_DAYS)
//
// Enforcement is opt-in, so the published images meter nobody until a deployment
// asks for it and a self-hosted install is never capped or aged out by Latitude
// Cloud's plan limits. Latitude Cloud sets LAT_BILLING_ENABLED=true on every
// service. A malformed value dies instead of falling back, because both silent
// outcomes (metering a self-hoster, not metering Cloud) are worse than a crash.
// ---------------------------------------------------------------------------

const invalidConfig = (reason: string) => new BillingConfigurationError({ reason })

// `parseEnv` samples `process.env` when it is called, so both readers are suspended:
// a deployment that rewrites its environment (and every test that stubs it) must be
// read at run time, not at module load.
export const billingEnforcementEnabled: Effect.Effect<boolean> = Effect.suspend(() =>
  parseEnv("LAT_BILLING_ENABLED", "boolean", false).pipe(
    Effect.mapError((error) => invalidConfig(error.message)),
    Effect.orDie,
  ),
)

export const selfHostedRetentionDays: Effect.Effect<number> = Effect.suspend(() =>
  parseEnv("LAT_TELEMETRY_RETENTION_DAYS", "number", SELF_HOSTED_PLAN_CONFIG.retentionDays).pipe(
    Effect.mapError((error) => invalidConfig(error.message)),
    Effect.flatMap((days) =>
      Number.isInteger(days) && days >= SELF_HOSTED_RETENTION_DAYS_MIN && days <= SELF_HOSTED_RETENTION_DAYS_MAX
        ? Effect.succeed(days)
        : Effect.fail(
            invalidConfig(
              `LAT_TELEMETRY_RETENTION_DAYS=${days} must be a whole number of days between ${SELF_HOSTED_RETENTION_DAYS_MIN} and ${SELF_HOSTED_RETENTION_DAYS_MAX}`,
            ),
          ),
    ),
    Effect.orDie,
  ),
)
