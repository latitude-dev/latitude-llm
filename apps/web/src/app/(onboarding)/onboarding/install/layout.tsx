'use server'

import { ReactNode } from 'react'
import { getOnboardingResources } from '$/data-access/workspaceOnboarding'
import { redirect } from 'next/navigation'
import { ROUTES } from '$/services/routes'
import { OnboardingInstallProvider } from './_lib/OnboardingInstallProvider'

export default async function OnboardingInstallLayout({
  children,
}: {
  children: ReactNode
}) {
  const { project } = await getOnboardingResources()
  if (!project) {
    return redirect(ROUTES.onboarding.choice)
  }

  return (
    <OnboardingInstallProvider project={project}>
      {children}
    </OnboardingInstallProvider>
  )
}
