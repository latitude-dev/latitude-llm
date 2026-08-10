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

/**
 * For screens that gate their own render and queries, not just a nav entry: an
 * unresolved flag set is indistinguishable from an empty one, so a gate built on
 * {@link useHasFeatureFlag} alone flashes its disabled state on every load.
 */
export function useFeatureFlagGate(identifier: FeatureFlagId): {
  readonly isEnabled: boolean
  readonly isLoading: boolean
} {
  const organizationId = useAuthenticatedOrganizationId()
  const { data, isPending } = useQuery({
    queryKey: getEnabledFeatureFlagsQueryKey(organizationId),
    queryFn: () => listEnabledFeatureFlagIdentifiers(),
    select: (identifiers) => new Set(identifiers),
  })

  return { isEnabled: data?.has(identifier) ?? false, isLoading: isPending }
}
