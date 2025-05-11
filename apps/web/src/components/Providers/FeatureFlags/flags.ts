import { env } from '@latitude-data/env'

export const FEATURE_FLAGS = {
  evaluationsV2: 'evaluationsV2',
  experiments: 'experiments',
  inviteOnly: 'inviteOnly',
} as const

export type FeatureFlag = keyof typeof FEATURE_FLAGS

type FeatureFlagCondition = { workspaceIds: number[] | 'all' }

// TODO: Ideally the storage should be Redis or DB with a backing table
export const FEATURE_FLAGS_CONDITIONS: Record<
  Exclude<FeatureFlag, 'inviteOnly'>, // Exclude 'inviteOnly' as it's global
  FeatureFlagCondition
> = {
  evaluationsV2: { workspaceIds: env.ENABLE_ALL_FLAGS ? 'all' : 'all' },
  experiments: { workspaceIds: env.ENABLE_ALL_FLAGS ? 'all' : 'all' },
  // 'inviteOnly' is resolved globally and doesn't have a workspace-specific condition here
}

export type ResolvedFeatureFlags = Record<FeatureFlag, { enabled: boolean }>
