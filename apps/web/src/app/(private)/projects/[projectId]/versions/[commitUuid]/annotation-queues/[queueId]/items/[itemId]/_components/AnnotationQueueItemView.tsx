'use client'

import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { TracesPane } from './TracesPane'
import { Text } from '@latitude-data/web-ui/atoms/Text'

export function AnnotationQueueItemView({
  queueId,
  itemId,
}: {
  queueId: number
  itemId: string
}) {
  const { project } = useCurrentProject()

  return (
    <div className='@container/annotation flex flex-col h-full w-full'>
      <div className='flex flex-row flex-1 min-h-0 overflow-hidden'>
        <div className='hidden @[1050px]/annotation:flex flex-col flex-shrink-0 w-[300px] border-r border-border overflow-y-auto p-4'>
          <TracesPane traceId={itemId} projectId={project.id} />
        </div>

        <div className='flex-1 min-w-0 overflow-y-auto p-4 border-r border-border'>
          <Text.H5 color='foregroundMuted'>Messages</Text.H5>
        </div>

        <div className='flex-shrink-0 w-[400px] overflow-y-auto p-4'>
          <Text.H5 color='foregroundMuted'>Annotations</Text.H5>
        </div>
      </div>

      <div className='flex-shrink-0 border-t border-border px-4 py-3 flex items-center justify-between'>
        <Text.H5 color='foregroundMuted'>Footer</Text.H5>
      </div>
    </div>
  )
}
