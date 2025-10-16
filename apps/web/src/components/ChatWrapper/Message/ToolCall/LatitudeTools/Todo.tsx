import type { TodoToolArgs } from '@latitude-data/core/services/latitudeTools/todo/types'
import { ContentCard, ContentCardContainer } from '../../ContentCard'
import { ToolContent } from '@latitude-data/constants/legacyCompiler'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { useMemo } from 'react'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { TodoListItem } from '@latitude-data/constants'

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
      <Icon name={icon} color={color} />
      <Text.H5 lineThrough={item.status === 'cancelled'} color={color}>
        {item.content}
      </Text.H5>
    </div>
  )
}

export function TodoLatitudeToolCallContent({
  toolCallId,
  args,
}: {
  toolCallId: string
  args: TodoToolArgs
  toolResponse?: ToolContent
}) {
  return (
    <ContentCard
      label='TODO'
      icon='listTodo'
      bgColor='bg-success'
      fgColor='successForeground'
      info={toolCallId}
    >
      <ContentCardContainer>
        <div className='w-full flex-col gap-4'>
          {args.todos.map((item) => (
            <TodoItem key={item.id} item={item} />
          ))}
        </div>
      </ContentCardContainer>
    </ContentCard>
  )
}
