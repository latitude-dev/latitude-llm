'use client'

import { Input } from '@latitude-data/web-ui/atoms/Input'
import { useColumn1Context } from '../contexts/column-1-context'
import { useDebouncedCallback } from 'use-debounce'
import React, { useCallback } from 'react'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'

export function SearchBox() {
  const { searchQuery, setSearchQuery } = useColumn1Context()
  const debouncedSetSearchQuery = useDebouncedCallback(setSearchQuery, 500)

  const handleSearchQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      debouncedSetSearchQuery(e.target.value)
    },
    [debouncedSetSearchQuery],
  )

  return (
    <div className='flex flex-row items-center gap-2 border rounded-lg border-foregroundMuted pl-2 mt-1 mr-1'>
      <Icon name='search' color='foregroundMuted' />
      <Input
        type='text'
        placeholder='Search integrations...'
        defaultValue={searchQuery}
        onChange={handleSearchQueryChange}
        className='w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 border-none'
      />
    </div>
  )
}
