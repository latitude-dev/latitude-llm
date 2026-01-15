import { useState } from 'react'

import { Button } from '@latitude-data/web-ui/atoms/Button'
import { DotIndicator } from '@latitude-data/web-ui/atoms/DotIndicator'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'

export function ReasoningMessageContent({
  reasoning,
  isStreaming,
}: {
  reasoning?: string
  isStreaming?: boolean
}) {
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div className='flex flex-col gap-2'>
      <Button
        variant='nope'
        onClick={() => setCollapsed(!collapsed)}
        className='flex flex-row justify-start'
      >
        <div className='flex flex-row gap-2 overflow-hidden'>
          <div className={cn({ 'inline-flex': !collapsed })}>
            {isStreaming ? (
              <DotIndicator pulse className='shrink-0 mt-1.5 ml-px' />
            ) : (
              <Icon
                name={collapsed ? 'chevronRight' : 'chevronDown'}
                color='foregroundMuted'
                className='shrink-0 mt-0.5'
              />
            )}
          </div>
          <Text.H5
            animate={isStreaming}
            noWrap={collapsed}
            ellipsis={collapsed}
            color='foregroundMuted'
          >
            {isStreaming
              ? 'Thinking...'
              : collapsed
                ? 'Thought'
                : reasoning || 'Thought in private...'}
          </Text.H5>
        </div>
      </Button>
    </div>
  )
}
