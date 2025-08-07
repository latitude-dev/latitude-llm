import { cache } from 'react'

import type { Workspace } from '@latitude-data/core/browser'
import { FEATURE_FLAGS_CONDITIONS, type FeatureFlag, type ResolvedFeatureFlags } from './flags'

export const getFeatureFlagsForWorkspaceCached = cache(
  ({ workspace }: { workspace: Workspace }) => {
    const flagKeys = Object.keys(FEATURE_FLAGS_CONDITIONS) as Array<FeatureFlag>
    return flagKeys.reduce((acc, key) => {
      const condition = FEATURE_FLAGS_CONDITIONS[key]
      // Ignore the flag if is not in the list
      if (!condition) return acc

      const enabled =
        condition.workspaceIds === 'all' || condition.workspaceIds.includes(workspace.id)
      return { ...acc, [key]: { enabled } }
    }, {} as ResolvedFeatureFlags)
  },
)
