'use client'

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'

interface FeatureFlags {
  inviteOnly: boolean | null
  isLoading: boolean
}

const FeatureFlagContext = createContext<FeatureFlags>({
  inviteOnly: null,
  isLoading: true,
})

export const useFeatureFlags = () => useContext(FeatureFlagContext)

interface FeatureFlagProviderProps {
  children: ReactNode
}

export const FeatureFlagProvider: React.FC<FeatureFlagProviderProps> = ({ children }) => {
  const [inviteOnly, setInviteOnly] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchConfig = async () => {
      setIsLoading(true)
      try {
        const response = await fetch('/api/config')
        if (!response.ok) {
          throw new Error(`Failed to fetch config: ${response.status}`)
        }
        const data = await response.json()
        setInviteOnly(data.inviteOnly === true) // Ensure boolean
      } catch (error) {
        console.error('Error fetching feature flags:', error)
        setInviteOnly(false) // Default to false on error to be safe
      } finally {
        setIsLoading(false)
      }
    }

    fetchConfig()
  }, [])

  return (
    <FeatureFlagContext.Provider value={{ inviteOnly, isLoading }}>
      {children}
    </FeatureFlagContext.Provider>
  )
}
