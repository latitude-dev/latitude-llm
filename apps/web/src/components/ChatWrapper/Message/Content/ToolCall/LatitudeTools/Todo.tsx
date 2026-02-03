import type { TodoToolArgs } from '@latitude-data/core/services/latitudeTools/todo/types'
import { ToolRequestContent } from '@latitude-data/constants/messages'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { useMemo, useState } from 'react'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { TodoListItem } from '@latitude-data/constants'
import {
  ToolCardIcon,
  ToolCardText,
  ToolCardWrapper,
} from '../_components/ToolCard'
import { ToolCardHeader } from '../_components/ToolCard/Header'
import { ToolCardContentWrapper } from '../_components/ToolCard/Content'

function TodoItem({ item }: { item: TodoListItem }) {
  const [icon, color] = useMemo<[IconName, TextColor]>(() => {
    if (item.status === 'completed') return ['circleCheck', 'foregroundMuted']
    if (item.status === 'cancelled') return ['circleX', 'foregroundMuted']
    if (item.status === 'in_progress') return ['circleArrowRight', 'primary']
    if (item.status === 'pending') return ['circle', 'foreground']
    return ['circle', 'foreground']
  }, [item.status])

  return (
    <div className='flex gap-2 items-start'>
      <Icon name={icon} color={color} className='min-w-4' />
      <Text.H5 lineThrough={item.status === 'cancelled'} color={color}>
        {item.content}
      </Text.H5>
    </div>
  )
}

export function TodoLatitudeToolCard({
  toolRequest,
  messageIndex,
  contentBlockIndex,
}: {
  toolRequest: ToolRequestContent
  messageIndex?: number
  contentBlockIndex?: number
}) {
  const [isOpen, setIsOpen] = useState(false)
  const args = toolRequest.args as TodoToolArgs

  return (
    <ToolCardWrapper
      messageIndex={messageIndex}
      contentBlockIndex={contentBlockIndex}
    >
      <ToolCardHeader
        icon={<ToolCardIcon name='listTodo' />}
        label={
          <ToolCardText color='foregroundMuted'>
            {args.merge ? 'Updated TODO list' : 'Created TODO list'}
          </ToolCardText>
        }
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
        simulated={toolRequest._sourceData?.simulated}
      />
      {isOpen && (
        <ToolCardContentWrapper>
          <div className='w-full flex-col gap-4'>
            {args.todos.map((item) => (
              <TodoItem key={item.id} item={item} />
            ))}
          </div>
        </ToolCardContentWrapper>
      )}
    </ToolCardWrapper>
  )
}
