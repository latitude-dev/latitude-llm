'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { ProviderLogDto } from '@latitude-data/core/browser'

type LatteThreadContextType = {
  providerLog: ProviderLogDto | undefined
}

const LatteThreadContext = createContext<LatteThreadContextType | undefined>(
  undefined,
)

type LatteThreadProviderProps = {
  children: ReactNode
  providerLog: ProviderLogDto | undefined
}

export const LatteThreadProvider = ({
  children,
  providerLog,
}: LatteThreadProviderProps) => {
  return (
    <LatteThreadContext.Provider value={{ providerLog }}>
      {children}
    </LatteThreadContext.Provider>
  )
}

export const useLatteThreadProviderLog = () => {
  const context = useContext(LatteThreadContext)
  if (context === undefined) {
    throw new Error('useLatteThread must be used within a LatteThreadProvider')
  }
  return context
}
