'use client'

import { createContext, type ReactNode, useContext } from 'react'
import type { FeatureFlag, ResolvedFeatureFlags } from './flags'

type IFeatureFlagsContext = { featureFlags: ResolvedFeatureFlags }
const FeatureFlagContext = createContext<IFeatureFlagsContext>({
  featureFlags: {} as ResolvedFeatureFlags,
})

export function FeatureFlagProvider({
  children,
  featureFlags,
}: {
  children: ReactNode
  featureFlags: ResolvedFeatureFlags
}) {
  return (
    <FeatureFlagContext.Provider value={{ featureFlags }}>{children}</FeatureFlagContext.Provider>
  )
}

export function useFeatureFlag({ featureFlag }: { featureFlag: FeatureFlag }) {
  const flags = useContext(FeatureFlagContext)

  if (!flags) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagProvider')
  }

  const flag = flags.featureFlags[featureFlag]

  if (!flag) {
    // Typescript should catch this, but just in case
    throw new Error(`Feature flag ${featureFlag} not found`)
  }

  return flag
}
