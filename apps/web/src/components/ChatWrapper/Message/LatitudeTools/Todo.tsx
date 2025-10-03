import type { TodoToolArgs } from '@latitude-data/core/services/latitudeTools/todo/types'
import { ContentCard, ContentCardContainer } from '../ContentCard'
import { ToolContent } from '@latitude-data/constants/legacyCompiler'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { useMemo } from 'react'
import { TextColor } from '@latitude-data/web-ui/tokens'

function TodoItem({ todo }: { todo: TodoToolArgs['todos'][number] }) {
  const [icon, color] = useMemo<[IconName, TextColor]>(() => {
    if (todo.status === 'completed') return ['circleCheck', 'foregroundMuted']
    if (todo.status === 'cancelled') return ['circleX', 'foregroundMuted']
    if (todo.status === 'in_progress') return ['circleArrowRight', 'primary']
    if (todo.status === 'pending') return ['circle', 'foreground']
    return ['circle', 'foreground']
  }, [todo.status])

  return (
    <div className='flex gap-2 items-start'>
      <Icon name={icon} color={color} />
      <Text.H5 lineThrough={todo.status === 'cancelled'} color={color}>
        {todo.content}
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
          {args.todos.map((todo) => (
            <TodoItem key={todo.id} todo={todo} />
          ))}
        </div>
      </ContentCardContainer>
    </ContentCard>
  )
}
