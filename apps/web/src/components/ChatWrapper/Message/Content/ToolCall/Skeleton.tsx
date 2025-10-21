import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { ToolCardWrapper } from './_components/ToolCard'
import { ToolCardHeader } from './_components/ToolCard/Header'

export function ToolCardSkeleton() {
  return (
    <ToolCardWrapper className='animate-pulse'>
      <ToolCardHeader
        icon={<Skeleton className='w-8 h-8' />}
        label={<Skeleton height='h4' className='w-40' />}
        isOpen={false}
      />
    </ToolCardWrapper>
  )
}
