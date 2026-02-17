import { findCommitsByProjectCached } from '$/app/(private)/_data-access'
import { getCurrentUserOrRedirect } from '$/services/auth/getCurrentUser'
import { ROUTES } from '$/services/routes'
import { computeProductAccess } from '@latitude-data/core/services/productAccess/computeProductAccess'
import { redirect } from 'next/navigation'
import ProjectLayout from '../_components/ProjectLayout'
import { ProjectChanges } from './_components/ProjectChanges'
import buildMetatags from '$/app/_lib/buildMetatags'

export const metadata = buildMetatags({
  title: 'History',
  locationDescription: 'Project Version History',
})

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { projectId, commitUuid } = await params
  const { workspace } = await getCurrentUserOrRedirect()

  const productAccess = computeProductAccess(workspace)
  if (!productAccess.promptManagement) {
    redirect(ROUTES.projects.detail({ id: Number(projectId) }).root)
  }

  const allCommits = await findCommitsByProjectCached({
    projectId: Number(projectId),
  })

  return (
    <ProjectLayout projectId={Number(projectId)} commitUuid={commitUuid}>
      <ProjectChanges allCommits={allCommits} />
    </ProjectLayout>
  )
}
