import { parseEnv } from "@platform/env"
import { Effect } from "effect"
import { SELF_HOSTED_PLAN_CONFIG, SELF_HOSTED_RETENTION_DAYS_MAX, SELF_HOSTED_RETENTION_DAYS_MIN } from "./constants.ts"
import { BillingConfigurationError } from "./errors.ts"

const invalidConfig = (reason: string) => new BillingConfigurationError({ reason })

// Suspended so the environment is read per call, not once at module load.
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
