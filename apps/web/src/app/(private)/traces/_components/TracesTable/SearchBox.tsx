'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import { Badge, Button, Icon, Input } from '@latitude-data/web-ui'

type SearchColumn = {
  label: string
  field: string
  operators: Operator[]
}

type Operator = {
  label: string
  value: string
}

const SEARCH_COLUMNS: SearchColumn[] = [
  {
    label: 'Start Time',
    field: 'startTime',
    operators: [
      { label: 'is', value: 'eq' },
      { label: 'before', value: 'lt' },
      { label: 'after', value: 'gt' },
    ],
  },
  {
    label: 'End Time',
    field: 'endTime',
    operators: [
      { label: 'is', value: 'eq' },
      { label: 'before', value: 'lt' },
      { label: 'after', value: 'gt' },
    ],
  },
  {
    label: 'Name',
    field: 'name',
    operators: [
      { label: 'is', value: 'eq' },
      { label: 'contains', value: 'contains' },
      { label: 'is not', value: 'neq' },
      { label: 'not contains', value: 'not_contains' },
    ],
  },
  {
    label: 'Model',
    field: 'spans.model',
    operators: [
      { label: 'is', value: 'eq' },
      { label: 'contains', value: 'contains' },
      { label: 'is not', value: 'neq' },
      { label: 'not contains', value: 'not_contains' },
    ],
  },
  {
    label: 'Distinct ID',
    field: 'spans.distinctId',
    operators: [
      { label: 'is', value: 'eq' },
      { label: 'contains', value: 'contains' },
      { label: 'is not', value: 'neq' },
      { label: 'not contains', value: 'not_contains' },
    ],
  },
  {
    label: 'Commit UUID',
    field: 'spans.commitUuid',
    operators: [
      { label: 'is', value: 'eq' },
      { label: 'contains', value: 'contains' },
      { label: 'is not', value: 'neq' },
      { label: 'not contains', value: 'not_contains' },
    ],
  },
  {
    label: 'Prompt UUID',
    field: 'spans.documentUuid',
    operators: [
      { label: 'is', value: 'eq' },
      { label: 'contains', value: 'contains' },
      { label: 'is not', value: 'neq' },
      { label: 'not contains', value: 'not_contains' },
    ],
  },
]

type ActiveSearch = {
  column?: SearchColumn
  operator?: Operator
}

export type CompletedSearch = {
  column: SearchColumn
  operator: Operator
  value: string
}

type SearchBoxProps = {
  onSearch: (queries: CompletedSearch[]) => void
}

export function SearchBox({ onSearch }: SearchBoxProps) {
  const [inputValue, setInputValue] = useState('')
  const [activeSearch, setActiveSearch] = useState<ActiveSearch>({})
  const [completedSearches, setCompletedSearches] = useState<CompletedSearch[]>(
    [],
  )
  const [showSuggestions, setShowSuggestions] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleInputChange = (value: string) => {
    setInputValue(value)
    setShowSuggestions(true)
    // Filter suggestions based on input
    if (!activeSearch.column) {
      // Show filtered column suggestions
      const searchTerm = value.toLowerCase()
      const filteredColumns = SEARCH_COLUMNS.filter((col) =>
        col.label.toLowerCase().includes(searchTerm),
      )
      if (
        filteredColumns.length === 1 &&
        filteredColumns[0]?.label.toLowerCase() === searchTerm
      ) {
        handleColumnSelect(filteredColumns[0])
      }
    }
  }

  const handleColumnSelect = (column: SearchColumn) => {
    setActiveSearch({ column })
    setInputValue('')
    setShowSuggestions(true)
    inputRef.current?.focus()
  }

  const handleOperatorSelect = (operator: Operator) => {
    setActiveSearch((prev) => ({ ...prev, operator }))
    setInputValue('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && inputValue === '') {
      if (activeSearch.operator) {
        setActiveSearch((prev) => ({ column: prev.column }))
        setShowSuggestions(true)
      } else if (activeSearch.column) {
        setActiveSearch({})
        setShowSuggestions(false)
      } else if (completedSearches.length > 0) {
        // Remove the last completed search when backspace is pressed
        const newSearches = completedSearches.slice(0, -1)
        setCompletedSearches(newSearches)
        onSearch(newSearches)
      }
      return
    }

    if (e.key === 'Enter' && inputValue.trim()) {
      if (!activeSearch.column) {
        const matchingColumns = SEARCH_COLUMNS.filter((col) =>
          col.label.toLowerCase().includes(inputValue.toLowerCase()),
        )
        if (matchingColumns.length > 0) {
          handleColumnSelect(matchingColumns[0]!)
        }
      } else if (!activeSearch.operator) {
        // Find all matching operators
        const matchingOperators = activeSearch.column.operators.filter((op) =>
          op.label.toLowerCase().includes(inputValue.toLowerCase()),
        )
        // Select the first matching operator if available
        if (matchingOperators.length > 0) {
          handleOperatorSelect(matchingOperators[0]!)
        }
      } else {
        // We have column and operator, this must be the value
        const newSearch = {
          column: activeSearch.column,
          operator: activeSearch.operator,
          value: inputValue.trim(),
        }

        const newSearches = [...completedSearches, newSearch]
        setCompletedSearches(newSearches)
        onSearch(newSearches)

        // Reset the active search state but keep completed searches
        setActiveSearch({})
        setInputValue('')
        setShowSuggestions(false)
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
            <Badge
              key={index}
              variant='accent'
              className='shrink-0 flex items-center gap-1'
            >
              {search.column.label} {search.operator.label} {search.value}
              <Button variant='nope' onClick={() => removeSearch(index)}>
                <Icon name='close' size='small' color='primary' />
              </Button>
            </Badge>
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

      {showSuggestions && (
        <div className='absolute top-full left-0 w-full mt-1 bg-background border rounded-md shadow-lg z-50'>
          {!activeSearch.column && inputValue && (
            <div className='p-1'>
              {SEARCH_COLUMNS.filter((col) =>
                col.label.toLowerCase().includes(inputValue.toLowerCase()),
              ).map((column) => (
                <div
                  key={column.field}
                  className='px-3 py-2 hover:bg-secondary cursor-pointer rounded-sm'
                  onClick={() => handleColumnSelect(column)}
                >
                  {column.label}
                </div>
              ))}
            </div>
          )}
          {activeSearch.column && !activeSearch.operator && (
            <div className='p-1'>
              {activeSearch.column.operators
                .filter((operator) =>
                  operator.label
                    .toLowerCase()
                    .includes(inputValue.toLowerCase()),
                )
                .map((operator) => (
                  <div
                    key={operator.value}
                    className='px-3 py-2 hover:bg-secondary cursor-pointer rounded-sm'
                    onClick={() => handleOperatorSelect(operator)}
                  >
                    {operator.label}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
