import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'

export function LoadingEvaluationGeneration() {
  return (
    <div className='grid grid-cols-2 gap-x-4 items-center'>
      <Text.H5 color='foregroundMuted'>Evaluation</Text.H5>
      <Skeleton className='w-full h-10' />
    </div>
  )
}
