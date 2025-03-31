import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import {
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui/providers'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import { DocumentBlankSlateLayout } from '../../../../../_components/DocumentBlankSlateLayout'
import { DocumentsClient } from '../../../../../_components/DocumentsClient'

export function DocumentLogBlankSlate() {
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { document } = useCurrentDocument()

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
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid })
            .documents.detail({ uuid: document.documentUuid }).logs.upload
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
        <DocumentsClient />
      </div>
    </DocumentBlankSlateLayout>
  )
}
