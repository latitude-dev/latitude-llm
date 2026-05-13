import { useQuery } from "@tanstack/react-query"
import { useAuthenticatedOrganizationId } from "../../routes/_authenticated/-route-data.ts"
import { listEnabledFeatureFlagIdentifiers } from "./feature-flags.functions.ts"

export const FEATURE_FLAGS_QUERY_KEY = ["featureFlags", "enabled"] as const

const EMPTY_FEATURE_FLAGS = new Set<string>()

export const getEnabledFeatureFlagsQueryKey = (organizationId: string) => [...FEATURE_FLAGS_QUERY_KEY, organizationId]

export function useFeatureFlags(): ReadonlySet<string> {
  const organizationId = useAuthenticatedOrganizationId()
  const { data } = useQuery({
    queryKey: getEnabledFeatureFlagsQueryKey(organizationId),
    queryFn: () => listEnabledFeatureFlagIdentifiers(),
    select: (identifiers) => new Set(identifiers),
  })

  return data ?? EMPTY_FEATURE_FLAGS
}

export function useHasFeatureFlag(identifier: string): boolean {
  const featureFlags = useFeatureFlags()
  const normalizedIdentifier = identifier.trim()
  if (normalizedIdentifier.length === 0) return false

  return featureFlags.has(normalizedIdentifier)
}
