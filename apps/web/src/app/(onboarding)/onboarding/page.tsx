import { getOnboardingResources, isOnboardingCompleted } from '$/data-access'
import { ROUTES } from '$/services/routes'
import { PageNotFoundError } from 'next/dist/shared/lib/utils'
import { OnboardingClient } from './_components/OnboardingClient'
import { redirect } from 'next/navigation'
import { Result } from '@latitude-data/core/lib/Result'

export default async function NocodersPage() {
  const isCompleted = await isOnboardingCompleted()
  if (isCompleted) {
    redirect(ROUTES.dashboard.root)
  }

  const resourcesResult = await getOnboardingResources()
  if (!Result.isOk(resourcesResult)) {
    throw new PageNotFoundError('No resources found')
  }
  const { project } = resourcesResult.unwrap()

  return <OnboardingClient project={project} />
}
