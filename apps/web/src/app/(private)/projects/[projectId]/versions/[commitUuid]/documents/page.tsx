import { Text } from '@latitude-data/web-ui'

import DocumentsLayout from '../_components/DocumentsLayout'

export default async function DocumentsPage({
  params,
}: {
  params: { projectId: string; commitUuid: string }
}) {
  const projectId = Number(params.projectId)
  const commitUuid = params.commitUuid

  return (
    <DocumentsLayout projectId={projectId} commitUuid={commitUuid}>
      <div className='flex-1 flex flex-row justify-center py-6 px-4 h-full'>
        <div className='rounded-lg flex flex-col flex-1 gap-4 p-4 items-center justify-center max-w-md'>
          <Text.H5M centered>
            👈 Welcome! Choose or create a document from the sidebar to get
            started.
          </Text.H5M>
        </div>
      </div>
    </DocumentsLayout>
  )
}
