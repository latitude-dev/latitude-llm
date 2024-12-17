'use client'

import { useState, useRef, KeyboardEvent, useMemo } from 'react'
import { Badge, Input } from '@latitude-data/web-ui'
import { useSearchParams } from 'next/navigation'
import { SearchColumn, Operator, ActiveSearch, CompletedSearch } from '../types'
import { SEARCH_COLUMNS } from './constants'
import { filterByInput, initializeSearches } from './utils'
import { CompletedSearchBadge } from './CompletedSearchBadge'

type SearchBoxProps = {
  onSearch: (queries: CompletedSearch[]) => void
}

export function SearchBox({ onSearch }: SearchBoxProps) {
  const searchParams = useSearchParams()
  const [inputValue, setInputValue] = useState('')
  const [activeSearch, setActiveSearch] = useState<ActiveSearch>({})
  const [completedSearches, setCompletedSearches] = useState<CompletedSearch[]>(
    () => initializeSearches(searchParams),
  )
  const [isFocused, setIsFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const suggestedColumns = useMemo(
    () =>
      !activeSearch.column ? filterByInput(SEARCH_COLUMNS, inputValue) : [],
    [inputValue, activeSearch.column],
  )
  const suggestedOperators = useMemo(
    () =>
      activeSearch.column && !activeSearch.operator
        ? filterByInput(activeSearch.column.operators, inputValue)
        : [],
    [inputValue, activeSearch.column, activeSearch.operator],
  )

  const handleInputChange = (value: string) => {
    setInputValue(value)
    if (!activeSearch.column) {
      if (
        suggestedColumns.length === 1 &&
        suggestedColumns[0]?.label.toLowerCase() === value.toLowerCase()
      ) {
        handleColumnSelect(suggestedColumns[0])
      }
    }
  }

  const handleColumnSelect = (column: SearchColumn) => {
    setActiveSearch({ column })
    setInputValue('')
    inputRef.current?.focus()
  }

  const handleOperatorSelect = (operator: Operator) => {
    setActiveSearch((prev) => ({ ...prev, operator }))
    setInputValue('')
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && inputValue === '') {
      if (activeSearch.operator) {
        setActiveSearch((prev) => ({ column: prev.column }))
      } else if (activeSearch.column) {
        setActiveSearch({})
      } else if (completedSearches.length > 0) {
        const newSearches = completedSearches.slice(0, -1)
        setCompletedSearches(newSearches)
        onSearch(newSearches)
      }
      return
    }

    if (e.key === 'Enter' && inputValue.trim()) {
      if (!activeSearch.column) {
        if (suggestedColumns.length > 0) {
          handleColumnSelect(suggestedColumns[0]!)
        }
      } else if (!activeSearch.operator) {
        const matchingOperators = activeSearch.column.operators.filter((op) =>
          op.label.toLowerCase().includes(inputValue.toLowerCase()),
        )
        if (matchingOperators.length > 0) {
          handleOperatorSelect(matchingOperators[0]!)
        }
      } else {
        const newSearch = {
          column: activeSearch.column,
          operator: activeSearch.operator,
          value: inputValue.trim(),
        }
        const newSearches = [...completedSearches, newSearch]
        setCompletedSearches(newSearches)
        onSearch(newSearches)
        setActiveSearch({})
        setInputValue('')
        inputRef.current?.focus()
      }
    }
  }

  const removeSearch = (index: number) => {
    const newSearches = completedSearches.filter((_, i) => i !== index)
    setCompletedSearches(newSearches)
    onSearch(newSearches)
  }

  return (
    <div className='relative w-full'>
      <div className='flex items-center gap-2 px-3 py-1.5 border rounded-md bg-background'>
        <div className='flex items-center gap-1.5 flex-grow min-w-0 flex-wrap'>
          {completedSearches.map((search, index) => (
            <CompletedSearchBadge
              key={index}
              search={search}
              onRemove={() => removeSearch(index)}
            />
          ))}
          <div className='flex items-center gap-1.5 flex-grow min-w-0'>
            {activeSearch.column && (
              <Badge variant='secondary' className='shrink-0'>
                {activeSearch.column.label}
              </Badge>
            )}
            {activeSearch.operator && (
              <Badge variant='secondary' className='shrink-0'>
                {activeSearch.operator.label}
              </Badge>
            )}
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => {
                setTimeout(() => setIsFocused(false), 100)
              }}
              className='border-none shadow-none focus-visible:ring-0 bg-transparent p-0 h-auto outline-none'
              placeholder={
                !activeSearch.column
                  ? 'Search traces...'
                  : !activeSearch.operator
                    ? 'is, contains, ...'
                    : 'Type value...'
              }
            />
          </div>
        </div>
      </div>

      {isFocused &&
        (suggestedColumns.length > 0 || suggestedOperators.length > 0) && (
          <div className='absolute top-full left-0 w-full mt-1 bg-background border rounded-md shadow-lg z-50'>
            <div className='p-1'>
              {suggestedColumns.map((column) => (
                <div
                  key={column.field}
                  className='px-3 py-2 hover:bg-secondary cursor-pointer rounded-sm'
                  onClick={() => handleColumnSelect(column)}
                >
                  {column.label}
                </div>
              ))}
              {suggestedOperators.map((operator) => (
                <div
                  key={operator.value}
                  className='px-3 py-2 hover:bg-secondary cursor-pointer rounded-sm'
                  onClick={() => handleOperatorSelect(operator)}
                >
                  {operator.label}
                </div>
              ))}
            </div>
          </div>
        )}
    </div>
  )
}
