import { ExperimentDto } from '@latitude-data/core/schema/models/types/Experiment'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { cn } from '@latitude-data/web-ui/utils'

export function ExperimentPrompt({
  experiment,
  isSamePrompt,
  onCompare,
}: {
  experiment: ExperimentDto | undefined
  isSamePrompt?: boolean
  onCompare?: () => void
}) {
  return (
    <div
      className={cn(
        'w-full max-h-80 min-h-80 bg-secondary p-4 rounded-lg flex flex-col gap-2',
        {
          'overflow-hidden': !experiment?.metadata?.prompt,
          'overflow-auto custom-scrollbar': experiment?.metadata?.prompt,
        },
      )}
    >
      <div className='w-full flex flex-row items-center justify-between'>
        <Text.H5B color='foregroundMuted'>Prompt</Text.H5B>
        {onCompare && (
          <Tooltip
            asChild
            trigger={
              <Button
                variant={isSamePrompt ? 'ghost' : 'primaryMuted'}
                iconProps={{
                  name: 'gitCompareArrows',
                  className: 'shrink-0',
                }}
                onClick={onCompare}
                disabled={isSamePrompt}
                containerClassName={cn({
                  '!pointer-events-auto !cursor-default': isSamePrompt,
                })}
                className={cn({
                  '!pointer-events-auto !cursor-default': isSamePrompt,
                })}
                innerClassName={cn({
                  '!pointer-events-auto !cursor-default': isSamePrompt,
                })}
              >
                Compare
              </Button>
            }
            align='center'
            side='top'
            className='max-w-96'
          >
            {isSamePrompt
              ? 'This prompt is the same as the first experiment'
              : 'Compare this prompt with the first experiment'}
          </Tooltip>
        )}
      </div>
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
