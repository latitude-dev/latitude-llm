'use server'

import { isFeatureEnabledCached } from '$/app/(private)/_data-access'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { projectId, commitUuid } = await params

  const latteEnabled = await isFeatureEnabledCached('latte')
  if (latteEnabled) {
    return redirect(
      ROUTES.projects
        .detail({ id: Number(projectId) })
        .commits.detail({ uuid: commitUuid }).preview.root,
    )
  }

  return redirect(
    ROUTES.projects
      .detail({ id: Number(projectId) })
      .commits.detail({ uuid: commitUuid }).overview.root,
  )
}
