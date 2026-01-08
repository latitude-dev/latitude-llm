import { memo } from 'react'

import { MessageRole } from '@latitude-data/constants/legacyCompiler'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import type { MessageProps } from './types'
import { AssistantMessage } from './AssistantMessage'
import { DebugMessage } from './DebugMessage'
import { UserMessage } from './UserMessage'
import { SystemMessage } from './SystemMessage'

export const Message = memo(({ role, debugMode, ...rest }: MessageProps) => {
  if (debugMode) {
    // Debug Mode
    return <DebugMessage role={role} {...rest} />
  }

  // Readable Mode
  if (role === MessageRole.assistant) {
    return <AssistantMessage {...rest} />
  }

  if (role === MessageRole.user) {
    return <UserMessage {...rest} />
  }

  if (role === MessageRole.system) {
    return <SystemMessage {...rest} />
  }

  // Fallback to Debug Mode
  return <DebugMessage role={role} {...rest} />
})

export function MessageSkeleton({ role }: { role: string }) {
  return (
    <div className='flex flex-col gap-1 w-full items-start animate-pulse'>
      <div>
        <Badge variant={'muted'}>{role}</Badge>
      </div>
      <div className='flex flex-row items-stretch gap-4 pl-4 w-full'>
        <div className='flex-shrink-0 bg-muted w-1 rounded-lg' />
        <div className='flex flex-col gap-1 flex-grow min-w-0'>
          <Skeleton height='h4' className='w-1/2' />
          <Skeleton height='h4' className='w-3/4' />
        </div>
      </div>
    </div>
  )
}
