import type { ExperimentDto } from '@latitude-data/core/browser'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'

export function ExperimentPrompt({ experiment }: { experiment: ExperimentDto | undefined }) {
  return (
    <div
      className={cn('w-full max-h-80 min-h-80 bg-secondary p-4 rounded-lg flex flex-col gap-2', {
        'overflow-hidden': !experiment?.metadata?.prompt,
        'overflow-auto custom-scrollbar': experiment?.metadata?.prompt,
      })}
    >
      <Text.H5B color='foregroundMuted'>Prompt</Text.H5B>
      <div className='flex flex-col gap-1'>
        {experiment?.metadata?.prompt ? (
          experiment.metadata.prompt.split('\n').map((line, index) => (
            <Text.H6 monospace key={index} color='foregroundMuted'>
              {line}
            </Text.H6>
          ))
        ) : (
          <>
            <Skeleton height='h6' className='w-[20%]' />
            <Skeleton height='h6' className='w-[60%]' />
            <Skeleton height='h6' className='w-[70%]' />
            <Skeleton height='h6' className='w-[65%]' />
            <Skeleton height='h6' className='w-[20%] mb-4' />
            <Skeleton height='h6' className='w-[85%]' />
            <Skeleton height='h6' className='w-[30%]' />
          </>
        )}
      </div>
    </div>
  )
}
