'use client'

import {
  ReactNode,
  useCallback,
  useState,
  useRef,
  UIEvent,
  useEffect,
  useMemo,
} from 'react'
import { cn } from '../../../lib/utils'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../atoms/Command'
import { zIndex } from '../../tokens/zIndex'
import { FormField, type FormFieldProps } from '../../atoms/FormField'
import { Icon, IconName } from '../../atoms/Icons'
import { Skeleton } from '../../atoms/Skeleton'
import { Text } from '../../atoms/Text'
import {
  SelectContent,
  SelectGroup,
  SelectRoot,
  SelectTrigger,
  SelectValue,
  Options,
  SelectOption,
} from '../../atoms/Select'
import { useDebouncedCallback } from 'use-debounce'

type PaginatedSelectProps<V extends unknown = unknown> = Omit<
  FormFieldProps,
  'children'
> & {
  name: string
  value?: V
  defaultValue?: V
  onChange?: (value: V) => void
  fetch: (args: { query: string; cursor: string | undefined }) => Promise<{
    items: V[]
    totalCount: number
    cursor: string
  }>
  serialize: (value: V) => SelectOption<string>
  debounce?: number
  placeholder?: string
  disabled?: boolean
  required?: boolean
  width?: 'auto' | 'full'
  removable?: boolean
  trigger?: ReactNode
  loading?: boolean
}

function OptionSkeleton() {
  return (
    <CommandItem className='cursor-default flex items-center gap-2' disabled>
      <Skeleton className='h-4 w-4' />
      <Skeleton className='h-4 w-full' />
    </CommandItem>
  )
}

// TODO: review this component, it should receive the cursor and items state
// from its parent component and simply handle the frontend interactions.
export function PaginatedSelect<V extends unknown = unknown>({
  name,
  label,
  description,
  errors,
  autoFocus,
  trigger,
  placeholder,
  info,
  loading: isLoadingComponent = false,

  value,
  defaultValue,
  onChange,
  fetch,
  serialize,
  debounce = 200,

  badgeLabel,
  width = 'full',
  disabled = false,
  required = false,
  removable = false,
}: PaginatedSelectProps<V>) {
  const [isOpen, setIsOpen] = useState(false)
  const [items, setItems] = useState<V[]>([])
  const options = useMemo(() => {
    return items.map(serialize)
  }, [items, serialize])

  const [selectedValue, setSelectedValue] = useState<V | undefined>(
    value ?? defaultValue,
  )

  const selectedOption = useMemo(
    () => (selectedValue ? serialize(selectedValue) : undefined),
    [selectedValue, serialize],
  )

  const defaultOption = useMemo(
    () => (defaultValue ? serialize(defaultValue) : undefined),
    [defaultValue, serialize],
  )

  const _onChangeSelection = (newValue: string | undefined) => {
    if (newValue === undefined) {
      setSelectedValue(undefined)
      onChange?.(undefined as V)
      setIsOpen(false)
      return
    }

    // Find the option based on the newValue
    const valueIndex = options.findIndex((option) => option.value === newValue)
    if (valueIndex === -1) return

    const selectedItem = items[valueIndex]!
    setSelectedValue(selectedItem)
    onChange?.(selectedItem)
    setIsOpen(false)
  }

  const [totalCount, setTotalCount] = useState(0)
  const [cursor, setCursor] = useState<string | undefined>()

  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const requestIdRef = useRef(0)

  const executeFetch = useDebouncedCallback(
    async (query: string, cursor: string | undefined) => {
      requestIdRef.current += 1
      const currentRequest = requestIdRef.current

      if (cursor === undefined) {
        setItems([])
        setIsLoading(true)
      } else {
        setIsLoadingMore(true)
      }

      const result = await fetch({ query, cursor })
      if (currentRequest !== requestIdRef.current) return

      setIsLoading(false)
      setIsLoadingMore(false)

      setItems((prev) => {
        if (cursor === undefined) {
          return result.items
        } else {
          return [...prev, ...result.items]
        }
      })

      setTotalCount(result.totalCount)
      setCursor(result.cursor)
    },
    debounce,
  )

  const onSearchChange = useCallback(
    (query: string) => {
      setSearchQuery(query)
      executeFetch(query, undefined)
    },
    [executeFetch],
  )

  const loadNextPage = useCallback(() => {
    if (isLoading || isLoadingMore) return
    if (options.length >= totalCount) return
    executeFetch(searchQuery, cursor)
  }, [
    isLoading,
    isLoadingMore,
    options.length,
    totalCount,
    cursor,
    searchQuery,
    executeFetch,
  ])

  useEffect(() => {
    executeFetch('', undefined)
  }, [executeFetch])

  return (
    <FormField
      badgeLabel={badgeLabel}
      label={label}
      info={info}
      description={description}
      errors={errors}
      className={width === 'full' ? 'w-full' : 'w-auto'}
    >
      <div className={width === 'full' ? 'w-full' : 'w-auto'}>
        {isLoadingComponent ? (
          <Skeleton className='w-full h-8 rounded-md' />
        ) : (
          <SelectRoot
            required={required}
            disabled={disabled}
            name={name}
            value={selectedOption?.value}
            defaultValue={defaultOption?.value}
            open={isOpen}
            onOpenChange={setIsOpen}
          >
            {trigger ?? (
              <SelectTrigger
                autoFocus={autoFocus}
                className={cn({
                  'border-red-500 focus:ring-red-500': errors,
                })}
                removable={removable && !!value}
                onRemove={() => _onChangeSelection(undefined)}
              >
                <SelectValue
                  selected={selectedOption?.value}
                  options={selectedOption ? [selectedOption] : []}
                  placeholder={placeholder ?? 'Select an option'}
                />
              </SelectTrigger>
            )}
            <SelectContent className={cn(zIndex.dropdown, 'p-0')}>
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder='Search...'
                  value={searchQuery}
                  onValueChange={onSearchChange}
                  className='text-xs'
                />
                <CommandList
                  onScroll={(e: UIEvent<HTMLDivElement>) => {
                    const { scrollTop, scrollHeight, clientHeight } =
                      e.currentTarget
                    if (
                      !isLoadingMore &&
                      items.length < totalCount &&
                      scrollHeight - scrollTop <= clientHeight + 50
                    ) {
                      loadNextPage()
                    }
                  }}
                  className='overflow-auto max-h-60'
                >
                  <CommandGroup>
                    {!isLoading && (
                      <CommandEmpty>
                        <Text.H6>No results found.</Text.H6>
                      </CommandEmpty>
                    )}
                    {options.map((option) => (
                      <CommandItem
                        key={option.label}
                        value={option.label}
                        onSelect={() => {
                          _onChangeSelection(option.value as string)
                          onSearchChange('')
                        }}
                        className='cursor-pointer flex items-center gap-2'
                      >
                        {option.icon && typeof option.icon === 'string' ? (
                          <Icon name={option.icon as IconName} size='small' />
                        ) : (
                          option.icon
                        )}
                        <Text.H6>{option.label}</Text.H6>
                      </CommandItem>
                    ))}
                    {(isLoading || isLoadingMore) && (
                      <>
                        <OptionSkeleton />
                        <OptionSkeleton />
                        <OptionSkeleton />
                        <OptionSkeleton />
                      </>
                    )}
                    {!(isLoading || isLoadingMore) &&
                      options.length < totalCount && (
                        <CommandItem disabled>
                          <Text.H6 color='foregroundMuted'>Load more</Text.H6>
                        </CommandItem>
                      )}
                  </CommandGroup>
                </CommandList>
              </Command>
              <SelectGroup hidden>
                <Options options={options as SelectOption<V>[]} />
              </SelectGroup>
            </SelectContent>
          </SelectRoot>
        )}
      </div>
    </FormField>
  )
}
