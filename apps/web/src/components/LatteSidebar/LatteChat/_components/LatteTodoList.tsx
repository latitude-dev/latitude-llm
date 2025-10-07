'use client'

import { TodoList, TodoListItem } from '@latitude-data/constants'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Icon, IconName } from '@latitude-data/web-ui/atoms/Icons'
import { useMemo } from 'react'
import { TextColor } from '@latitude-data/web-ui/tokens'

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

export function LatteTodoList({ todoList }: { todoList: TodoList }) {
  if (!todoList.length) return null

  return (
    <div className='w-full flex flex-col gap-2 border-b border-latte-widget py-2 px-3'>
      <div className='w-full flex items-center justify-between'>
        <Text.H4M color='latteInputForeground' userSelect={false}>
          Todo List
        </Text.H4M>
      </div>
      <div className='w-full max-h-96 overflow-y-auto custom-scrollbar flex flex-col gap-1'>
        {todoList.map((item) => (
          <TodoItem key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}
