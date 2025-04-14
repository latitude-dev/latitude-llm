import { TableWithHeader } from '@latitude-data/web-ui/molecules/ListingHeader'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { findProjectCached } from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import DocumentsLayout from '../_components/DocumentsLayout'
import { DocumentBlankSlateLayout } from '../documents/_components/DocumentBlankSlateLayout'
import Overview from './_components/Overview'
import { AddFileButton } from './_components/Overview/AddFileButton'
import { AddPromptTextarea } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/overview/_components/Overview/AddPromptTextarea'
import { computeTotalRuns } from '@latitude-data/core/services/projects/computeTotalRuns'

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { projectId, commitUuid } = await params
  const session = await getCurrentUser()
  const project = await findProjectCached({
    projectId: Number(projectId),
    workspaceId: session.workspace.id,
  })

  const totalRuns = await computeTotalRuns(project).then((r) => r.unwrap())

  return (
    <DocumentsLayout projectId={Number(projectId)} commitUuid={commitUuid}>
      {totalRuns > 0 ? (
        <div className='p-6'>
          <TableWithHeader
            title='Overview'
            table={<Overview project={project} />}
          />
        </div>
      ) : (
        <DocumentBlankSlateLayout
          title={project.name}
          description='To get started, please choose one of the following options.'
        >
          <AddFileButton />
          <Text.H5 color='foregroundMuted'>Or</Text.H5>
          <AddPromptTextarea />
        </DocumentBlankSlateLayout>
      )}
    </DocumentsLayout>
  )
}
