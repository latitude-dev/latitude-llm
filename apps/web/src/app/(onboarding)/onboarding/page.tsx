import { getOnboardingResources, isOnboardingCompleted } from '$/data-access'
import { OnboardingClient } from './_components/OnboardingClient'
import { redirect } from 'next/navigation'

export default async function NocodersPage() {
  const isCompleted = await isOnboardingCompleted()
  if (isCompleted) {
    redirect('/dashboard')
  }

  const { project } = await getOnboardingResources()

  return <OnboardingClient project={project} />
}
