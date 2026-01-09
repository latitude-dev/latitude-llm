'use server'

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getOnboardingResources } from '$/data-access/workspaceOnboarding'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ApiKeysRepository } from '@latitude-data/core/repositories'
import { ROUTES } from '$/services/routes'
import { OnboardingFlow } from './_components/OnboardingFlow'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'

function LoadingFallback() {
  return (
    <div className='flex flex-col min-h-screen items-center justify-center'>
      <Icon name='loader' size='xlarge' className='animate-spin' />
    </div>
  )
}

export default async function OnboardingPage() {
  const { workspace } = await getCurrentUserOrRedirect()
  const { project, commit, documents } = await getOnboardingResources()

  if (!project || !commit) {
    return redirect(ROUTES.dashboard.root)
  }

  const apiKeysRepo = new ApiKeysRepository(workspace.id)
  const apiKeys = await apiKeysRepo.findAll().then((r) => r.unwrap())
  const firstApiKey = apiKeys[0]
  const firstDocument = documents[0]

  return (
    <Suspense fallback={<LoadingFallback />}>
      <OnboardingFlow
        workspaceApiKey={firstApiKey?.token}
        projectId={project.id}
        commitUuid={commit.uuid}
        documentUuid={firstDocument?.documentUuid}
      />
    </Suspense>
  )
}

