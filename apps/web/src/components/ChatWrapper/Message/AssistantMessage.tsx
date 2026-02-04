import { cn } from '@latitude-data/web-ui/utils'
import { Content } from './Content'
import { ToolCardSkeleton } from './Content/ToolCall/Skeleton'
import { MessageProps } from './types'

export function AssistantMessage({
  content,
  className,
  size,
  animatePulse,
  toolContentMap,
  isGeneratingToolCall,
  isStreaming = false,
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
        toolContentMap={toolContentMap}
        color='foreground'
        size={size}
        debugMode={false}
        markdownSize='md'
        isStreaming={isStreaming}
      />
      {isGeneratingToolCall && <ToolCardSkeleton />}
    </div>
  )
}
