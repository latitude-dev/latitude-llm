import { findCommitsByProjectCached } from '$/app/(private)/_data-access'
import DocumentsLayout from '../_components/DocumentsLayout'
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
  const allCommits = await findCommitsByProjectCached({
    projectId: Number(projectId),
  })

  return (
    <DocumentsLayout projectId={Number(projectId)} commitUuid={commitUuid}>
      <ProjectChanges allCommits={allCommits} />
    </DocumentsLayout>
  )
}
