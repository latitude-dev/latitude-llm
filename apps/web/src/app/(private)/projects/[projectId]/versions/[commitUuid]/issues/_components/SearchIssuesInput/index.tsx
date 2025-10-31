import { ChangeEvent, useCallback, useState } from 'react'
import { useIssuesParameters } from '$/stores/issues/useIssuesParameters'
import { SafeIssuesParams } from '@latitude-data/constants/issues'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { cn } from '@latitude-data/web-ui/utils'
import { useDebouncedCallback } from 'use-debounce'

export function SearchIssuesInput({
  serverParams,
}: {
  serverParams: SafeIssuesParams
}) {
  const { filters, setFilters } = useIssuesParameters((state) => ({
    filters: state.filters,
    setFilters: state.setFilters,
  }))
  const [query, setQuery] = useState(
    filters.query ?? serverParams.filters?.query ?? '',
  )
  const onChangeQuery = useDebouncedCallback((value: string) => {
    setFilters({
      ...filters,
      query: value || undefined,
    })
  }, 300)
  const onChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value)
      onChangeQuery(e.target.value)
    },
    [onChangeQuery],
  )
  return (
    <div
      className={cn(
        'max-w-96 flex items-center gap-2 w-full border border-input bg-background ring-offset-background',
        'focus-within:outline-none focus-within:ring-ring rounded-md focus-within:ring-2 focus-within:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'px-2 py-1 h-8',
      )}
    >
      <Icon name='search' color='foregroundMuted' />
      <input
        placeholder='Search issues...'
        className={cn(
          'focus-visible:outline-none bg-transparent w-full',
          'focus-visible:ring-0 text-sm',
        )}
        value={query}
        onChange={onChange}
      />
    </div>
  )
}
