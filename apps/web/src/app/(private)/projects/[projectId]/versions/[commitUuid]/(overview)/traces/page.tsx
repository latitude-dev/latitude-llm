import { listTraces } from '@latitude-data/core/services/traces/list'
import { TableWithHeader, Text } from '@latitude-data/web-ui'
import {
  findCommitCached,
  findProjectCached,
} from '$/app/(private)/_data-access'
import { getCurrentUser } from '$/services/auth/getCurrentUser'

import { DocumentBlankSlateLayout } from '../../(commit)/documents/_components/DocumentBlankSlateLayout'
import { DocumentsClient } from '../../(commit)/documents/_components/DocumentsClient'
import { TracesTable } from './_components/TracesTable'

export default async function TracesPage({
  params,
  searchParams,
}: {
  params: Promise<{
    projectId: string
    commitUuid: string
  }>
  searchParams: Promise<{
    page: string
    pageSize: string
  }>
}) {
  const user = await getCurrentUser()
  const { projectId, commitUuid } = await params
  const { page, pageSize } = await searchParams
  const commit = await findCommitCached({
    projectId: Number(projectId),
    uuid: commitUuid,
  })
  const project = await findProjectCached({
    projectId: Number(projectId),
    workspaceId: user.workspace.id,
  })
  const traces = await listTraces({
    project,
    page: Number(page ?? '1'),
    pageSize: Number(pageSize ?? '25'),
  }).then((r) => r.unwrap())

  if (!traces?.items.length) {
    // TODO: move to the parent server page.tsx
    return (
      <DocumentBlankSlateLayout className='p-6'>
        <div className='flex flex-col gap-4 items-center'>
          <Text.H4M>{project.name}</Text.H4M>
          <Text.H5>There are no traces for this project yet.</Text.H5>
        </div>
        <div className='p-6 bg-background border rounded-lg flex flex-col gap-4 max-w-3xl'>
          <Text.H4M>Instrument your application with Latitude</Text.H4M>
          <Text.H5 color='foregroundMuted'>
            Add this code snippet to start uploading traces to Latitude. Once
            done, come back to this page, and you'll be able to evaluate both
            existing and incoming traces.
          </Text.H5>
          <DocumentsClient />
        </div>
      </DocumentBlankSlateLayout>
    )
  }

  return (
    <div className='flex flex-grow min-h-0 flex-col w-full p-6 gap-2 min-w-0'>
      <TableWithHeader
        title='Traces'
        table={
          <TracesTable
            traces={traces}
            projectId={Number(projectId)}
            commit={commit}
            workspace={user.workspace}
          />
        }
      />
    </div>
  )
}
