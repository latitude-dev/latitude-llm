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
          'px-4 py-3 bg-primary-muted rounded-2xl',
          'max-w-full overflow-hidden',
          {
            'animate-pulse': animatePulse,
          },
          className,
        )}
      >
        <Content
          content={content}
          color='accentForeground'
          size={size}
          parameters={parameters}
          toolContentMap={toolContentMap}
          debugMode={false}
          markdownSize='none'
          limitVerticalPadding={true}
        />
        {isGeneratingToolCall && <ToolCardSkeleton />}
      </div>
    </div>
  )
}
