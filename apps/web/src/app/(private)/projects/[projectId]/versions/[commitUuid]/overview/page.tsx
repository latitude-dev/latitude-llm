'use server'

import buildMetatags from '$/app/_lib/buildMetatags'
import { ROUTES } from '$/services/routes'
import { redirect } from 'next/navigation'

export async function generateMetadata() {
  return buildMetatags({
    title: 'Overview',
    locationDescription: 'Project General Overview',
  })
}

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { projectId: projectIdString, commitUuid } = await params
  const projectId = Number(projectIdString)

  return redirect(
    ROUTES.projects
      .detail({ id: Number(projectId) })
      .commits.detail({ uuid: commitUuid }).analytics.root,
  )
}
