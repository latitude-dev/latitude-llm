import { computeProjectStats } from '@latitude-data/core/services/projects/computeProjectStats'
import { TableWithHeader, Text } from '@latitude-data/web-ui'
import { findProjectCached } from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import { AddFileButton } from '../../(commit)/documents/_components/AddFileButton'
import { DocumentBlankSlateLayout } from '../../(commit)/documents/_components/DocumentBlankSlateLayout'
import { DocumentsClient } from '../../(commit)/documents/_components/DocumentsClient'
import Overview from './_components/Overview'

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { projectId } = await params
  const session = await getCurrentUser()
  const project = await findProjectCached({
    projectId: Number(projectId),
    workspaceId: session.workspace.id,
  })

  const projectStats = await computeProjectStats({
    project,
  }).then((result) => result.unwrap())

  return projectStats.totalRuns > 0 ? (
    <div className='p-6'>
      <TableWithHeader
        title='Overview'
        table={<Overview project={project} stats={projectStats} />}
      />
    </div>
  ) : projectStats.totalDocuments > 0 ? (
    <DocumentBlankSlateLayout className='p-6'>
      <div className='flex flex-col gap-4 items-center'>
        <Text.H4M>{project.name}</Text.H4M>
        <Text.H5>There are no logs for this project yet.</Text.H5>
      </div>
      <div className='p-6 bg-background border rounded-lg flex flex-col gap-4 max-w-3xl'>
        <Text.H4M>Upload logs to Latitude</Text.H4M>
        <Text.H5 color='foregroundMuted'>
          Run this code snippet to start uploading logs to Latitude. Once done,
          come back to this page, and you'll be able to evaluate both existing
          and incoming logs.
        </Text.H5>
        <DocumentsClient />
      </div>
    </DocumentBlankSlateLayout>
  ) : (
    <DocumentBlankSlateLayout className='p-6'>
      <div className='flex flex-col gap-4 items-center'>
        <Text.H4M>{project.name}</Text.H4M>
        <Text.H5>
          To get started, please choose one of the following options:
        </Text.H5>
      </div>
      <AddFileButton />
      <Text.H5 color='foregroundMuted'>Or</Text.H5>
      <div className='p-6 bg-background border rounded-lg flex flex-col gap-4 max-w-3xl'>
        <Text.H4M>Import your logs</Text.H4M>
        <Text.H5 color='foregroundMuted'>
          Run this code snippet to start importing logs into Latitude. Once
          done, come back to this page, and you'll be able to evaluate both
          existing and incoming logs.
        </Text.H5>
        <DocumentsClient />
      </div>
    </DocumentBlankSlateLayout>
  )
}
