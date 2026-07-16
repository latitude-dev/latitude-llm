import type { FeatureFlagId } from "@domain/feature-flags"
import { useQuery } from "@tanstack/react-query"
import { useAuthenticatedOrganizationId } from "../../routes/_authenticated/-route-data.ts"
import { listEnabledFeatureFlagIdentifiers } from "./feature-flags.functions.ts"

const FEATURE_FLAGS_QUERY_KEY = ["featureFlags", "enabled"] as const

const EMPTY_FEATURE_FLAGS = new Set<FeatureFlagId>()

const getEnabledFeatureFlagsQueryKey = (organizationId: string) => [...FEATURE_FLAGS_QUERY_KEY, organizationId]

export function useFeatureFlags(): ReadonlySet<FeatureFlagId> {
  const organizationId = useAuthenticatedOrganizationId()
  const { data } = useQuery({
    queryKey: getEnabledFeatureFlagsQueryKey(organizationId),
    queryFn: () => listEnabledFeatureFlagIdentifiers(),
    select: (identifiers) => new Set(identifiers),
  })

  return data ?? EMPTY_FEATURE_FLAGS
}

export function useHasFeatureFlag(identifier: FeatureFlagId): boolean {
  const featureFlags = useFeatureFlags()
  return featureFlags.has(identifier)
}
