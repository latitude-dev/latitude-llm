import { ChangeEvent, useCallback } from 'react'
import { useDebouncedCallback } from 'use-debounce'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { cn } from '@latitude-data/web-ui/utils'
import { font } from '@latitude-data/web-ui/tokens'
import { useIntegrationsListContext } from './IntegrationsListProvider'

export function SearchBox() {
  const { searchQuery, setSearchQuery } = useIntegrationsListContext()
  const debouncedSetSearchQuery = useDebouncedCallback(setSearchQuery, 500)

  const handleSearchQueryChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      debouncedSetSearchQuery(e.target.value)
    },
    [debouncedSetSearchQuery],
  )

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-2 w-full border border-input bg-background ring-offset-background',
          'focus-within:outline-none focus-within:ring-ring rounded-md focus-within:ring-2 focus-within:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'px-2 py-1 h-8',
        )}
      >
        <Icon name='search' color='foregroundMuted' />
        <input
          type='text'
          placeholder='Search integrations...'
          defaultValue={searchQuery}
          onChange={handleSearchQueryChange}
          className={cn(
            'w-full bg-transparent border-none outline-none py-1',
            font.size.h5,
          )}
        />
      </div>
    </>
  )
}
