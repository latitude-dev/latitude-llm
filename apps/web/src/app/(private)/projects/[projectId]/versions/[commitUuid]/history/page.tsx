import { findCommitsByProjectCached } from '$/app/(private)/_data-access'
import buildMetatags from '$/app/_lib/buildMetatags'
import ProjectLayout from '../_components/ProjectLayout'
import { ProjectChanges } from './_components/ProjectChanges'

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
  const allCommits = await findCommitsByProjectCached({
    projectId: Number(projectId),
  })

  return (
    <ProjectLayout projectId={Number(projectId)} commitUuid={commitUuid}>
      <ProjectChanges allCommits={allCommits} />
    </ProjectLayout>
  )
}
