import { cache } from 'react'

import { Workspace } from '@latitude-data/core/browser'
import {
  FEATURE_FLAGS_CONDITIONS,
  // FeatureFlag, // No longer strictly needed here if flagKeys is typed correctly
  // ResolvedFeatureFlags, // Return type will be more specific
} from './flags'

// Define a more specific type for the keys and return value of this function
type ConditionalFeatureFlag = keyof typeof FEATURE_FLAGS_CONDITIONS
type WorkspaceResolvedFlags = Record<ConditionalFeatureFlag, { enabled: boolean }>

export const getFeatureFlagsForWorkspaceCached = cache(
  ({ workspace }: { workspace: Workspace }): WorkspaceResolvedFlags => {
    const flagKeys = Object.keys(
      FEATURE_FLAGS_CONDITIONS,
    ) as Array<ConditionalFeatureFlag>
    return flagKeys.reduce((acc, key) => {
      // key is now correctly typed as 'evaluationsV2' | 'experiments'
      const condition = FEATURE_FLAGS_CONDITIONS[key]
      // The 'if (!condition)' check is technically no longer needed if flagKeys are derived from FEATURE_FLAGS_CONDITIONS directly
      // and key is correctly typed, but it doesn't hurt to keep for robustness if the types were to change.
      // However, for stricter typing, it implies key might not be in FEATURE_FLAGS_CONDITIONS, which contradicts its derivation.
      // Let's assume `condition` will always be found.

      const enabled =
        condition.workspaceIds === 'all' ||
        condition.workspaceIds.includes(workspace.id)
      return { ...acc, [key]: { enabled } }
    }, {} as WorkspaceResolvedFlags)
  },
)
