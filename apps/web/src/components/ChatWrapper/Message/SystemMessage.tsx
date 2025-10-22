import { Content } from './Content'
import { MessageProps } from './types'
import { useState } from 'react'
import { Button } from '@latitude-data/web-ui/atoms/Button'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'

export function SystemMessage({
  content,
  className,
  size,
  parameters,
  toolContentMap,
}: Omit<MessageProps, 'debugMode' | 'role'>) {
  const [collapsed, setCollapsed] = useState(true)

  return (
    <Button
      variant='nope'
      onClick={() => setCollapsed(!collapsed)}
      className={cn('flex flex-row justify-start', className)}
    >
      <div className='flex flex-row gap-2 overflow-hidden'>
        <Icon
          name={collapsed ? 'chevronRight' : 'chevronDown'}
          className='min-w-4 mt-0.5'
          color='foregroundMuted'
        />
        <div className='flex flex-col gap-2 items-start justify-start'>
          <Text.H5B color='foregroundMuted'>System Instructions</Text.H5B>
          {!collapsed && (
            <Content
              content={content}
              color='foregroundMuted'
              size={size}
              parameters={parameters}
              toolContentMap={toolContentMap}
              debugMode={false}
              markdownSize='sm'
            />
          )}
        </div>
      </div>
    </Button>
  )
}
