import { cn } from '@latitude-data/web-ui/utils'
import { Content } from './Content'
import { ToolCardSkeleton } from './Content/ToolCall/Skeleton'
import { MessageProps } from './types'

export function AssistantMessage({
  content,
  className,
  size,
  animatePulse,
  parameters,
  toolContentMap,
  isGeneratingToolCall,
}: Omit<MessageProps, 'debugMode' | 'role'>) {
  return (
    <div
      className={cn(
        'flex flex-col w-full items-start',
        {
          'animate-pulse': animatePulse,
        },
        className,
      )}
    >
      <Content
        content={content}
        color='foreground'
        size={size}
        parameters={parameters}
        toolContentMap={toolContentMap}
        debugMode={false}
      />
      {isGeneratingToolCall && <ToolCardSkeleton />}
    </div>
  )
}
