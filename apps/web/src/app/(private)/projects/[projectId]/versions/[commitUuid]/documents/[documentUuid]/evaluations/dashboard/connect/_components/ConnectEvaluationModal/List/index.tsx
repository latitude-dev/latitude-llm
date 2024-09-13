import React from 'react'

import { Input, SelectableCard, Text } from '@latitude-data/web-ui'

interface EvaluationListProps {
  items: {
    uuid: string
    name: string
    description: string
    type: 'evaluation' | 'template'
  }[]
  selectedItem: string | undefined
  onSelectItem: (uuid: string) => void
  searchTerm: string
  onSearchChange: (term: string) => void
}

export default function EvaluationList({
  items,
  selectedItem,
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
          <SelectableCard
            key={item.uuid}
            title={item.name}
            description={item.description}
            selected={item.uuid === selectedItem}
            onClick={() => onSelectItem(item.uuid)}
          />
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
