import React from 'react'

import { Icon, Input, Text } from '@latitude-data/web-ui'

interface EvaluationListProps {
  items: {
    uuid: string
    name: string
    description: string
    type: 'evaluation' | 'template'
  }[]
  selectedItems: string[]
  onSelectItem: (uuid: string) => void
  searchTerm: string
  onSearchChange: (term: string) => void
}

export default function EvaluationList({
  items,
  selectedItems,
  onSelectItem,
  searchTerm,
  onSearchChange,
}: EvaluationListProps) {
  return (
    <div className='w-1/3'>
      <Input
        type='text'
        placeholder='Search evaluations and templates...'
        value={searchTerm}
        onChange={(e) => onSearchChange(e.target.value)}
        className='w-full p-2 mb-4 border rounded-lg'
      />
      <ul className='space-y-2'>
        {items.map((item) => (
          <li
            key={item.uuid}
            className={`p-2 flex flex-row gap-1 items-start cursor-pointer rounded-lg ${
              selectedItems.includes(item.uuid)
                ? 'bg-primary/10 border-primary'
                : 'hover:bg-muted border-muted'
            } border `}
            onClick={() => onSelectItem(item.uuid)}
          >
            {selectedItems.includes(item.uuid) && (
              <Icon name='check' color='primary' />
            )}
            <div className='min-w-0 flex flex-col gap-2'>
              <Text.H5M
                ellipsis
                noWrap
                color={
                  selectedItems.includes(item.uuid) ? 'primary' : 'foreground'
                }
              >
                {item.name}
              </Text.H5M>
              <Text.H6
                color={
                  selectedItems.includes(item.uuid) ? 'primary' : 'foreground'
                }
              >
                {item.description.length > 45
                  ? `${item.description.slice(0, 42)}...`
                  : item.description}
              </Text.H6>
              <Text.H6 color='foregroundMuted'>
                {item.type === 'evaluation' ? 'Evaluation' : 'Template'}
              </Text.H6>
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 && (
        <div className='text-center'>
          <Text.H6 color='foregroundMuted'>
            No evaluations or templates found
          </Text.H6>
        </div>
      )}
    </div>
  )
}
