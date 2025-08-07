'use client'

import { useFeatureFlag } from '$/components/Providers/FeatureFlags'
import { useCurrentUser } from '$/stores/currentUser'
import { createContext, useCallback, useContext, type ReactNode } from 'react'

type DevModeContextType = {
  devMode: boolean
  setDevMode: (devMode: boolean) => void
  isLoading: boolean
}

const DevModeContext = createContext<DevModeContextType | undefined>(undefined)

type DevModeProviderProps = {
  children: ReactNode
}

export function DevModeProvider({ children }: DevModeProviderProps) {
  const { enabled: blocksEditorEnabled } = useFeatureFlag({
    featureFlag: 'blocksEditor',
  })

  const {
    data: user,
    isLoading: isLoadingUser,
    updateEditorMode,
    isUpdatingEditorMode,
  } = useCurrentUser()

  const devMode = blocksEditorEnabled ? (user?.devMode ?? false) : true
  const setDevMode = useCallback(
    async (devMode: boolean) => {
      if (!blocksEditorEnabled) return
      await updateEditorMode({ devMode })
    },
    [blocksEditorEnabled, updateEditorMode],
  )
  const isLoading = isLoadingUser || isUpdatingEditorMode

  return (
    <DevModeContext.Provider value={{ devMode, setDevMode, isLoading }}>
      {children}
    </DevModeContext.Provider>
  )
}

export function useDevMode() {
  const context = useContext(DevModeContext)
  if (context === undefined) {
    throw new Error('useDevMode must be used within a DevModeProvider')
  }
  return context
}
