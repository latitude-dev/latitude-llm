'use server'

import { ReactNode } from 'react'
import { getOnboardingResources } from '$/data-access/onboarding'
import { redirect } from 'next/navigation'
import { ROUTES } from '$/services/routes'
import { ProjectProvider } from '$/app/providers/ProjectProvider'

export default async function OnboardingInstallLayout({
  children,
}: {
  children: ReactNode
}) {
  const { project } = await getOnboardingResources()
  if (!project) {
    return redirect(ROUTES.onboarding.choice)
  }

  return <ProjectProvider project={project}>{children}</ProjectProvider>
}
