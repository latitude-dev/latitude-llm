'use client'

import usePipedreamApps from '$/stores/pipedreamApps'
import { App } from '@pipedream/sdk/browser'
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type Column1ContextType = {
  isLoading: boolean
  pipedreamApps: App[]
  searchQuery: string
  setSearchQuery: (query: string) => void
}

const Column1Context = createContext<Column1ContextType | undefined>(undefined)

type Column1ProviderProps = {
  children: ReactNode
}

export function Column1Provider({ children }: Column1ProviderProps) {
  const [searchQuery, setSearchQuery] = useState<string>('')
  const { data: pipedreamApps, isLoading } = usePipedreamApps({
    query: searchQuery,
  })

  const value: Column1ContextType = useMemo(
    () => ({
      isLoading,
      pipedreamApps,
      searchQuery,
      setSearchQuery,
    }),
    [isLoading, pipedreamApps, searchQuery, setSearchQuery],
  )

  return (
    <Column1Context.Provider value={value}>{children}</Column1Context.Provider>
  )
}

export function useColumn1Context() {
  const context = useContext(Column1Context)
  if (context === undefined) {
    throw new Error('useColumn1Context must be used within a Column1Provider')
  }
  return context
}
