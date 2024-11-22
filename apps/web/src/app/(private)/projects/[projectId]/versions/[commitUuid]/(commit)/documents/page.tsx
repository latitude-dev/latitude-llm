import { Text } from '@latitude-data/web-ui'
import { findProjectCached } from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import { AddFileButton } from './_components/AddFileButton'
import { DocumentBlankSlateLayout } from './_components/DocumentBlankSlateLayout'
import { DocumentsClient } from './_components/DocumentsClient'

export default async function DocumentsPage({
  params,
}: {
  params: Promise<{ projectId: string; commitUuid: string }>
}) {
  const { projectId } = await params
  const { workspace } = await getCurrentUser()
  const project = await findProjectCached({
    projectId: Number(projectId),
    workspaceId: workspace.id,
  })

  return (
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
