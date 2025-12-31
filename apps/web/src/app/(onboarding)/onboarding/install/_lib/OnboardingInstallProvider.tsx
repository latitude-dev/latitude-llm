'use client'

import { createContext, ReactNode, useContext } from 'react'
import { Project } from '@latitude-data/core/schema/models/types/Project'

type OnboardingInstallContextType = {
  project: Project
}

const OnboardingInstallContext = createContext<OnboardingInstallContextType>(
  {} as OnboardingInstallContextType,
)

export function OnboardingInstallProvider({
  children,
  project,
}: {
  children: ReactNode
  project: Project
}) {
  return (
    <OnboardingInstallContext.Provider value={{ project }}>
      {children}
    </OnboardingInstallContext.Provider>
  )
}

export function useOnboardingInstall() {
  const context = useContext(OnboardingInstallContext)
  if (!context.project) {
    throw new Error(
      'useOnboardingInstall must be used within an OnboardingInstallProvider',
    )
  }
  return context
}

