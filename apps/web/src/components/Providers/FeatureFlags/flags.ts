import { env } from '@latitude-data/env'

export const FEATURE_FLAGS = {
  latte: 'latte',
  blocksEditor: 'blocksEditor',
  integrationTriggers: 'integrationTriggers',
  tracing: 'tracing',
} as const

export type FeatureFlag = keyof typeof FEATURE_FLAGS

type FeatureFlagCondition = { workspaceIds: number[] | 'all' }

// TODO: Ideally the storage should be Redis or DB with a backing table
export const FEATURE_FLAGS_CONDITIONS: Record<
  FeatureFlag,
  FeatureFlagCondition
> = {
  latte: { workspaceIds: env.ENABLE_ALL_FLAGS ? 'all' : [1] },
  blocksEditor: { workspaceIds: env.ENABLE_ALL_FLAGS ? 'all' : [10240] },
  integrationTriggers: { workspaceIds: env.ENABLE_ALL_FLAGS ? 'all' : [1] },
  tracing: { workspaceIds: env.ENABLE_ALL_FLAGS ? 'all' : [1] },
}

export type ResolvedFeatureFlags = Record<FeatureFlag, { enabled: boolean }>
