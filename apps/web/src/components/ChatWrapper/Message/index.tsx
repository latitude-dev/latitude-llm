import { memo } from 'react'

import type { MessageProps } from './types'
import { AssistantMessage } from './AssistantMessage'
import { DebugMessage } from './DebugMessage'
import { UserMessage } from './UserMessage'
import { SystemMessage } from './SystemMessage'

export const Message = memo(
  ({ role, debugMode, isStreaming = false, ...rest }: MessageProps) => {
    if (debugMode) {
      return <DebugMessage role={role} isStreaming={isStreaming} {...rest} />
    }

    if (role === 'assistant') {
      return <AssistantMessage isStreaming={isStreaming} {...rest} />
    }

    if (role === 'user') {
      return <UserMessage {...rest} />
    }

    if (role === 'system') {
      return <SystemMessage {...rest} />
    }

    return <DebugMessage role={role} isStreaming={isStreaming} {...rest} />
  },
)
