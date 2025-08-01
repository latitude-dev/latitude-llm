'use client'

import { createContext, useContext, useState, type ReactNode } from 'react'

type DevModeContextType = {
  devMode: boolean
  setDevMode: (devMode: boolean) => void
}

const DevModeContext = createContext<DevModeContextType | undefined>(undefined)

type DevModeProviderProps = {
  children: ReactNode
}

export function DevModeProvider({ children }: DevModeProviderProps) {
  const [devMode, setDevMode] = useState(true)

  return (
    <DevModeContext.Provider value={{ devMode, setDevMode }}>
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
