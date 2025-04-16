export const FEATURE_FLAGS = {
  evaluationsV2: 'evaluationsV2',
  experiments: 'experiments',
} as const

export type FeatureFlag = keyof typeof FEATURE_FLAGS

type FeatureFlagCondition = { workspaceIds: number[] | 'all' }

// TODO: Ideally the storage should be Redis or DB with a backing table
export const FEATURE_FLAGS_CONDITIONS: Record<
  FeatureFlag,
  FeatureFlagCondition
> = {
  evaluationsV2: { workspaceIds: [] },
  experiments: { workspaceIds: [] },
}

export type ResolvedFeatureFlags = Record<FeatureFlag, { enabled: boolean }>
