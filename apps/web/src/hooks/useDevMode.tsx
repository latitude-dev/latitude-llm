'use client'

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
  const {
    data: user,
    isLoading: isLoadingUser,
    updateEditorMode,
    isUpdatingEditorMode,
  } = useCurrentUser()

  const devMode = user?.devMode ?? false
  const setDevMode = useCallback(
    async (devMode: boolean) => {
      await updateEditorMode({ devMode })
    },
    [updateEditorMode],
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
