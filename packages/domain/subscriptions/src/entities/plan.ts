/**
 * Plan enum - available subscription tiers.
 *
 * V3/V4/V1 suffixes indicate major plan versions for migration tracking.
 */
export type Plan = "HobbyV3" | "TeamV4" | "EnterpriseV1" | "ScaleV1";

/**
 * Plan configuration - defines quotas and features for each plan.
 */
export interface PlanConfig {
  readonly name: Plan;
  readonly displayName: string;
  readonly seats: number;
  readonly runs: number | null; // null = unlimited
  readonly credits: number;
  readonly features: readonly string[];
}

/**
 * Default configurations for each plan.
 */
export const PLAN_CONFIGS: Record<Plan, PlanConfig> = {
  HobbyV3: {
    name: "HobbyV3",
    displayName: "Hobby",
    seats: 3,
    runs: 10_000,
    credits: 100,
    features: ["basic-analytics", "email-support"],
  },
  TeamV4: {
    name: "TeamV4",
    displayName: "Team",
    seats: 10,
    runs: 100_000,
    credits: 1_000,
    features: ["advanced-analytics", "priority-support", "api-access", "webhooks"],
  },
  EnterpriseV1: {
    name: "EnterpriseV1",
    displayName: "Enterprise",
    seats: 100,
    runs: null,
    credits: 10_000,
    features: [
      "advanced-analytics",
      "dedicated-support",
      "api-access",
      "webhooks",
      "sso",
      "audit-logs",
      "custom-integrations",
    ],
  },
  ScaleV1: {
    name: "ScaleV1",
    displayName: "Scale",
    seats: 50,
    runs: 500_000,
    credits: 5_000,
    features: [
      "advanced-analytics",
      "priority-support",
      "api-access",
      "webhooks",
      "sso",
      "audit-logs",
    ],
  },
};

/**
 * Get configuration for a specific plan.
 */
export const getPlanConfig = (plan: Plan): PlanConfig => {
  return PLAN_CONFIGS[plan];
};

/**
 * Check if plan includes a specific feature.
 */
export const hasFeature = (plan: Plan, feature: string): boolean => {
  return PLAN_CONFIGS[plan].features.includes(feature);
};

/**
 * Get all available plans.
 */
export const getAvailablePlans = (): readonly Plan[] => {
  return Object.keys(PLAN_CONFIGS) as Plan[];
};
