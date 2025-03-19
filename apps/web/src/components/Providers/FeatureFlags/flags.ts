export const FEATURE_FLAGS = {
  datasetsV2: 'datasetsV2',
  datasetsV1ModificationBlocked: 'datasetsV1ModificationBlocked',
} as const

export type FeatureFlag = keyof typeof FEATURE_FLAGS

type FeatureFlagCondition = { workspaceIds: number[] | 'all' }

// TODO: Ideally the storage should be Redis or DB with a backing table
export const FEATURE_FLAGS_CONDITIONS: Record<
  FeatureFlag,
  FeatureFlagCondition
> = {
  datasetsV2: { workspaceIds: [] },
  datasetsV1ModificationBlocked: { workspaceIds: [] },
}

export type ResolvedFeatureFlags = Record<FeatureFlag, { enabled: boolean }>
