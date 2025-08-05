import { ComponentProps, ReactNode, useEffect, useMemo, useRef } from 'react'
import { Command } from 'cmdk'
import { cn } from '../../../lib/utils'
import { Icon, IconProps } from '../../atoms/Icons'
import { Skeleton } from '../../atoms/Skeleton'
import { Text } from '../../atoms/Text'
import { font } from '../../tokens/font'

function LoadingItem() {
  return (
    <div
      className={cn(
        'group p-4 cursor-pointer',
        'aria-selected:bg-accent aria-selected:text-accent-foreground',
        'transition-colors',
        'flex flex-row min-w-0 gap-x-4',
      )}
    >
      <div className='flex-none'>
        <Skeleton
          height='h8'
          className='h-10 w-10 rounded-md bg-backgroundCode'
        />
      </div>
      <div className='flex-1 flex flex-col gap-y-2 min-w-0'>
        <Skeleton height='h4' className='w-1/3' />
        <Skeleton height='h5' className='w-1/2' />
      </div>
    </div>
  )
}

const LOADING_ITEMS = Array.from({ length: 15 })
const SMALL_LOADING = Array.from({ length: 5 })

function LoadingList({ size }: { size: 'loading' | 'loadingMore' }) {
  const items = size === 'loading' ? LOADING_ITEMS : SMALL_LOADING
  return (
    <div className='flex flex-col gap-y-4 min-h-0'>
      {size === 'loading' && <Skeleton height='h5' className='w-1/2' />}
      <div className='flex flex-col gap-y-4 overflow-y-auto custom-scrollbar'>
        <GroupWrapper>
          {items.map((_, idx) => (
            <LoadingItem key={idx} />
          ))}
        </GroupWrapper>
      </div>
    </div>
  )
}

function SearchInput(props: ComponentProps<typeof Command.Input>) {
  const { placeholder = 'Search…', ...inputProps } = props
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
        <Command.Input
          placeholder={placeholder}
          className={cn(
            'w-full bg-transparent border-none outline-none py-1',
            font.size.h5,
          )}
          {...inputProps}
        />
      </div>
    </>
  )
}

function ImageIcon({ imageIcon }: { imageIcon: OptionItem['imageIcon'] }) {
  if (!imageIcon?.type) return null

  if (imageIcon.type === 'image') {
    return (
      <img
        src={imageIcon.src}
        alt={imageIcon.alt}
        width={40}
        height={40}
        className='rounded'
      />
    )
  }

  return (
    <div
      className={cn(
        'size-10 rounded-md bg-backgroundCode flex items-center justify-center',
        'group-aria-selected:bg-accent',
      )}
    >
      <Icon name={imageIcon.name} size='large' />
    </div>
  )
}

type ItemProps = ComponentProps<typeof Command.Item> & {
  item: OptionItem
  isSelected?: boolean
}
function Item({ item, onSelect, isSelected, ...itemProps }: ItemProps) {
  return (
    <Command.Item
      onSelect={onSelect}
      className={cn(
        'group p-4 cursor-pointer',
        'aria-selected:bg-accent aria-selected:text-accent-foreground',
        'data-picked:bg-accent data-picked:text-accent-foreground',
        'transition-colors',
        'flex flex-row min-w-0 gap-x-4',
        {
          'bg-accent text-accent-foreground': isSelected,
        },
      )}
      {...itemProps}
    >
      {item.imageIcon ? (
        <div className='flex-none'>
          <ImageIcon imageIcon={item.imageIcon} />
        </div>
      ) : null}
      <div className='flex-1 flex flex-row items-center gap-x-2 min-w-0'>
        <div
          className={cn(
            'flex flex-col',
            'group-aria-selected:[&>span]:!text-accent-foreground min-w-0',
            {
              '[&>span]:!text-foregroundMuted': !isSelected,
            },
          )}
        >
          <Text.H4 ellipsis noWrap>
            {item.title}
          </Text.H4>
          <Text.H5 ellipsis noWrap color='foregroundMuted'>
            {item.description}
          </Text.H5>
        </div>
        <Icon
          name='arrowRight'
          color='foregroundMuted'
          size='large'
          className={cn(
            'group-aria-selected:text-accent-foreground ml-auto flex-none',
            {
              'text-accent-foreground': isSelected,
            },
          )}
        />
      </div>
    </Command.Item>
  )
}

type ItemIcon = { type: 'icon'; name: IconProps['name'] }
type ItemImage = { type: 'image'; src: string; alt: string }
export type OptionItem = {
  type: 'item'
  value: string
  keywords?: string[] // Search keywords for the item
  title: string
  description: string
  imageIcon?: ItemIcon | ItemImage
  disabled?: boolean
}
type OptionGroup = {
  type: 'group'
  label: string
  items: OptionItem[]
  loading?: boolean
}

export type Option = OptionItem | OptionGroup

function Heading({
  label,
  loading = false,
}: {
  label: string
  loading?: boolean
}) {
  return (
    <div className='flex items-center justify-between mb-2'>
      <Text.H5M display='block'>{label}</Text.H5M>
      {loading ? (
        <div className='flex flex-row justify-center gap-x-2'>
          <Text.H6 color='foregroundMuted'>Loading...</Text.H6>
          <Icon
            name='loader'
            spin
            size='small'
            color='foregroundMuted'
            className='flex-none'
          />
        </div>
      ) : null}
    </div>
  )
}

function renderItem({
  item,
  idx,
  onSelectValue,
  isSelected,
}: {
  item: OptionItem
  idx: number
  onSelectValue?: (value: string) => void
  isSelected?: boolean
}) {
  return (
    <Item
      key={idx}
      value={item.value}
      item={item}
      onSelect={onSelectValue}
      isSelected={isSelected}
    />
  )
}

function GroupWrapper({ children }: { children: ReactNode }) {
  return (
    <div className='border border-border rounded-2xl overflow-hidden divide-border divide-y'>
      {children}
    </div>
  )
}

function renderGroup({
  group,
  idx,
  onSelectValue,
  selectedValue,
}: {
  group: OptionGroup
  idx: number
  onSelectValue?: (value: string) => void
  selectedValue?: string | undefined
}) {
  return (
    <Command.Group
      key={idx}
      heading={<Heading loading={group.loading} label={group.label} />}
    >
      <GroupWrapper>
        {!group.loading
          ? group.items.map((item, idx) =>
            renderItem({
              item,
              idx,
              onSelectValue,
              isSelected: item.value === selectedValue,
            }),
          )
          : SMALL_LOADING.map((_, idx) => <LoadingItem key={idx} />)}
      </GroupWrapper>
    </Command.Group>
  )
}

type Props = {
  loading?: boolean
  onSelectValue?: (value: string) => void
  onSearchChange?: (query: string) => void
  items: Option[]
  selectedValue?: string | undefined
  placeholder?: string
  emptyMessage?: string
  infiniteScroll?: {
    onReachBottom?: () => void
    isLoadingMore?: boolean
    isReachingEnd?: boolean
    totalCount?: number
  }
  totalCount?: number
}

export function SearchableList({
  selectedValue,
  onSelectValue,
  onSearchChange,
  items,
  placeholder,
  loading = false,
  emptyMessage = 'No results',
  infiniteScroll,
}: Props) {
  const observerRef = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onReachBottom = infiniteScroll?.onReachBottom

    if (!onReachBottom || !sentinelRef.current) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry?.isIntersecting && !infiniteScroll?.isLoadingMore) {
          onReachBottom()
        }
      },
      {
        threshold: 0.1,
        rootMargin: '200px 0px',
      },
    )

    observerRef.current.observe(sentinelRef.current)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [infiniteScroll?.onReachBottom, infiniteScroll?.isLoadingMore])

  const endMessage = useMemo(() => {
    if (infiniteScroll?.totalCount !== undefined) {
      return `No more items, the list has ${infiniteScroll?.totalCount} items`
    }
    return 'No more items'
  }, [infiniteScroll?.totalCount])

  return (
    <Command className='relative flex flex-col gap-y-4 h-full min-h-0'>
      <SearchInput placeholder={placeholder} onValueChange={onSearchChange} />
      {loading ? (
        <LoadingList size='loading' />
      ) : (
        <Command.List
          asChild
          className='overflow-y-auto custom-scrollbar space-y-4 scrollable-indicator'
        >
          {items.map((option, idx) =>
            option.type === 'group'
              ? renderGroup({
                group: option,
                idx,
                onSelectValue,
                selectedValue,
              })
              : renderItem({
                item: option,
                idx,
                onSelectValue,
                isSelected: option.value === selectedValue,
              }),
          )}

          <Command.Empty className='py-6 flex items-center justify-center'>
            <Text.H6>{emptyMessage}</Text.H6>
          </Command.Empty>

          {/* End message when no more items to load */}
          {infiniteScroll?.isReachingEnd &&
            !infiniteScroll?.isLoadingMore &&
            items.length > 0 && (
              <div className='pt-2 pb-4 flex items-center justify-center'>
                <Text.H6 color='foregroundMuted'>{endMessage}</Text.H6>
              </div>
            )}

          {/* Sentinel element for intersection observer */}
          {infiniteScroll?.onReachBottom &&
            !infiniteScroll?.isLoadingMore &&
            !infiniteScroll?.isReachingEnd && (
              <div ref={sentinelRef} className='h-1' />
            )}

          {/* Infinite loading items */}
          {infiniteScroll?.isLoadingMore && (
            <div className='py-4 w-full flex justify-center'>
              <Icon name='loader' spin size='xlarge' color='foregroundMuted' />
            </div>
          )}
        </Command.List>
      )}
    </Command>
  )
}
