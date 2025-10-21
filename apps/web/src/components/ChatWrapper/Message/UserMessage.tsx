import { cn } from '@latitude-data/web-ui/utils'
import { Content } from './Content'
import { ToolCardSkeleton } from './Content/ToolCall/Skeleton'
import { MessageProps } from './types'

export function UserMessage({
  content,
  className,
  size,
  animatePulse,
  parameters,
  toolContentMap,
  isGeneratingToolCall,
}: Omit<MessageProps, 'debugMode' | 'role'>) {
  return (
    <div className='flex flex-row py-4'>
      <div className='min-w-[20%] flex-grow' />
      <div
        className={cn(
          'flex flex-col gap-1 items-start',
          'p-4 bg-primary-muted rounded-2xl',
          {
            'animate-pulse': animatePulse,
          },
          className,
        )}
      >
        <Content
          content={content}
          color='primary'
          size={size}
          parameters={parameters}
          toolContentMap={toolContentMap}
          debugMode={false}
          limitVerticalPadding={true}
        />
        {isGeneratingToolCall && <ToolCardSkeleton />}
      </div>
    </div>
  )
}
