import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'

import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import { PublishedDocument } from '@latitude-data/core/schema/models/types/PublishedDocument'
function Dot() {
  return <div className='w-1 h-1 bg-border rounded-full' />
}

export function PublishedDocumentPreview({
  document,
  publishedData,
}: {
  document: DocumentVersion
  publishedData?: PublishedDocument
}) {
  return (
    <div className='flex flex-col w-full border border-border rounded-sm relative max-w-[300px] items-center'>
      <div className='flex flex-row w-full bg-muted items-center gap-1 p-1'>
        <Dot />
        <Dot />
        <Dot />
      </div>
      <div className='flex flex-col w-full items-center p-4 gap-2'>
        <Text.H8>
          {publishedData?.title ?? document.path.split('/').at(-1)}
        </Text.H8>
        <div className='flex flex-col max-w-[100px] w-full gap-1 border border-border rounded-sm p-2'>
          <Skeleton height='h8' className='w-8' />
          <div className='w-full h-2 border border-border' />
          <Skeleton height='h8' className='w-12' />
          <div className='w-full h-2 border border-border' />
          <Skeleton height='h8' className='w-10' />
          <div className='w-full h-2 border border-border' />
          <div className='w-full h-2 bg-primary rounded-sm' />
        </div>
      </div>
    </div>
  )
}
