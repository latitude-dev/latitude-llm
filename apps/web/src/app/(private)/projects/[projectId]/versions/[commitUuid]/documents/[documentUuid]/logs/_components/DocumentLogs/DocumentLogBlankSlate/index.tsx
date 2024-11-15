import { Commit } from '@latitude-data/core/browser'
import { Button, Text } from '@latitude-data/web-ui'
import { getDocumentByUuidCached } from '$/app/(private)/_data-access'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import { DocumentBlankSlateLayout } from '../../../../../_components/DocumentBlankSlateLayout'
import { DocumentsClient } from '../../../../../_components/DocumentsClient'

export async function DocumentLogBlankSlate({
  commit,
  projectId,
  documentUuid,
}: {
  commit: Commit
  documentUuid: string
  projectId: number
}) {
  const document = await getDocumentByUuidCached({
    documentUuid,
    projectId,
    commitUuid: commit.uuid,
  })
  return (
    <DocumentBlankSlateLayout>
      <div className='flex flex-col gap-4 items-center'>
        <Text.H5>
          To get started, please choose one of the following options:
        </Text.H5>
      </div>
      <Link
        href={
          ROUTES.projects
            .detail({ id: projectId })
            .commits.detail({ uuid: commit.uuid })
            .documents.detail({ uuid: documentUuid }).logs.upload
        }
      >
        <Button fullWidth variant='outline'>
          <div className='flex flex-col gap-1 p-4'>
            <Text.H4M>Import logs from UI</Text.H4M>
            <Text.H5 color='foregroundMuted'>
              If you run prompts outside of Latitude, you can upload your logs
              in order to evaluate them.
            </Text.H5>
          </div>
        </Button>
      </Link>
      <Text.H5 color='foregroundMuted'>Or</Text.H5>
      <div className='p-6 bg-background border rounded-lg flex flex-col gap-4 max-w-3xl'>
        <Text.H4M>Import logs from code</Text.H4M>
        <Text.H5 color='foregroundMuted'>
          Run this code snippet to start importing logs into Latitude. Once
          done, come back to this page, and you'll be able to evaluate both
          existing and incoming logs.
        </Text.H5>
        <DocumentsClient document={document} />
      </div>
    </DocumentBlankSlateLayout>
  )
}
