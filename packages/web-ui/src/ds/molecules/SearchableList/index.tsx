import {
  ComponentProps,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  createContext,
  useContext,
  ComponentType,
} from 'react'
import { Command } from 'cmdk'
import { cn } from '../../../lib/utils'
import { Icon, IconProps } from '../../atoms/Icons'
import { Skeleton } from '../../atoms/Skeleton'
import { Text } from '../../atoms/Text'
import { font } from '../../tokens/font'

export type ItemPresenterProps<T extends ItemType> = {
  item: OptionItem<T>
  textSize: ItemProps<T>['textSize']
  isSelected?: boolean
}

type ItemPresenterComponent<T extends ItemType> = ComponentType<
  ItemPresenterProps<T>
>

type RenderItemContextValue<T extends ItemType> = {
  ItemPresenter?: ItemPresenterComponent<T>
}

const RenderItemContext = createContext<RenderItemContextValue<ItemType>>({})

export function useRenderItemContext<T extends ItemType>() {
  return useContext(RenderItemContext) as unknown as RenderItemContextValue<T>
}

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

function LoadingList({
  size,
  multiGroup,
  groupStyle,
}: {
  multiGroup: boolean
  groupStyle: GroupWrapperProps['style']
  size: 'loading' | 'loadingMore'
}) {
  const items = size === 'loading' ? LOADING_ITEMS : SMALL_LOADING
  return (
    <div className='flex flex-col gap-y-4 min-h-0'>
      {multiGroup && <Skeleton height='h5' className='w-1/2' />}
      <div className='flex flex-col gap-y-4 overflow-y-auto custom-scrollbar'>
        <GroupWrapper style={groupStyle}>
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

export function ImageIcon({
  imageIcon,
}: {
  imageIcon: OptionItem['imageIcon']
}) {
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
        'group-aria-selected:bg-accent group-aria-selected:text-accent-foreground text-muted-foreground',
      )}
    >
      <Icon name={imageIcon.name} size='large' />
    </div>
  )
}

function DefaultItemPresenter<T extends ItemType = 'item'>({
  item,
  textSize,
  isSelected,
}: ItemPresenterProps<T>) {
  const TextTitle = textSize === 'normal' ? Text.H4 : Text.H5M
  return (
    <div
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
              '[&>span]:!text-accent-foreground': isSelected,
            },
          )}
        >
          <TextTitle ellipsis noWrap>
            {item.title}
          </TextTitle>
          {item.description ? (
            <Text.H5 ellipsis noWrap color='foregroundMuted'>
              {item.description}
            </Text.H5>
          ) : null}
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
    </div>
  )
}

type ItemProps<T extends ItemType> = Omit<
  ComponentProps<typeof Command.Item>,
  'onSelect'
> & {
  item: OptionItem<T>
  textSize: 'normal' | 'small'
  onSelectValue?: OnSelectValue<T>
  isSelected?: boolean
}
function Item<T extends ItemType = 'item'>({
  item,
  textSize,
  onSelectValue,
  isSelected,
  ...itemProps
}: ItemProps<T>) {
  const onSelect = useCallback(
    (value: string) => {
      onSelectValue?.(value, item.metadata)
    },
    [onSelectValue, item.metadata],
  )
  const { ItemPresenter } = useRenderItemContext<T>()
  return (
    <Command.Item
      onSelect={onSelect}
      onMouseLeave={(e) => e.currentTarget.removeAttribute('aria-selected')}
      {...itemProps}
    >
      {ItemPresenter ? (
        <ItemPresenter
          item={item}
          textSize={textSize}
          isSelected={isSelected}
        />
      ) : (
        <DefaultItemPresenter
          item={item}
          textSize={textSize}
          isSelected={isSelected}
        />
      )}
    </Command.Item>
  )
}

type ItemIcon = { type: 'icon'; name: IconProps['name'] }

type MetadataItem<ItemType> = {
  type: ItemType
  [key: string]: unknown
}
type ItemType = unknown
type ItemImage = { type: 'image'; src: string; alt: string }

export type OptionItem<T extends ItemType = 'no_type'> = {
  type: 'item'
  value: string
  title: string
  description: string
  keywords?: string[] // Search keywords for the item
  metadata?: MetadataItem<T>
  imageIcon?: ItemIcon | ItemImage
  disabled?: boolean
}

export type OptionGroup<T extends ItemType = 'no_type'> = {
  type: 'group'
  label: string
  items: OptionItem<T>[]
  loading?: boolean
}

export type Option<T extends ItemType = 'no_type'> =
  | OptionItem<T>
  | OptionGroup<T>

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
        <div className='flex flex-row items-center justify-center gap-x-2 overflow-hidden'>
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

export type OnSelectValue<T extends ItemType = 'no_type'> = (
  value: string,
  metadata?: MetadataItem<T>,
) => void
function renderItem<T extends ItemType = 'no_type'>({
  item,
  idx,
  onSelectValue,
  isSelected,
  textSize,
}: {
  idx: number
  item: OptionItem<T>
  onSelectValue?: OnSelectValue<T>
  isSelected?: boolean
  textSize: ItemProps<T>['textSize']
}) {
  return (
    <Item
      key={idx}
      value={item.value}
      item={item}
      onSelectValue={onSelectValue}
      textSize={textSize}
      isSelected={isSelected}
    />
  )
}

type GroupWrapperProps = {
  children: ReactNode
  style: 'border' | 'onlySeparators'
  hidden?: boolean
}
function GroupWrapper({ children, style, hidden }: GroupWrapperProps) {
  return (
    <div
      className={cn('border-border', {
        'rounded-2xl overflow-hidden ': style === 'border',
        ' divide-border divide-y border-b':
          style === 'onlySeparators' && !hidden,
        'divide-y divide-borde border': style === 'border' && !hidden,
      })}
    >
      {children}
    </div>
  )
}

function renderGroup<T extends ItemType = 'no_type'>({
  group,
  idx,
  onSelectValue,
  groupStyle,
  textSize,
  selectedValue,
}: {
  group: OptionGroup<T>
  idx: number
  groupStyle: GroupWrapperProps['style']
  textSize: ItemProps<T>['textSize']
  onSelectValue?: OnSelectValue<T>
  selectedValue?: string | undefined
}) {
  const hasItems = group.items && group.items.length > 0
  return (
    <Command.Group
      key={idx}
      heading={
        !group.loading && !hasItems ? (
          <></>
        ) : (
          <Heading loading={group.loading} label={group.label} />
        )
      }
    >
      <GroupWrapper style={groupStyle} hidden={!hasItems && !group.loading}>
        {!group.loading
          ? group.items.map((item, idx) =>
              renderItem({
                item,
                idx,
                textSize,
                onSelectValue,
                isSelected: item.value === selectedValue,
              }),
            )
          : SMALL_LOADING.map((_, idx) => <LoadingItem key={idx} />)}
      </GroupWrapper>
    </Command.Group>
  )
}

function MultiGroupList<T extends ItemType>({
  items,
  selectedValue,
  onSelectValue,
  groupStyle,
  textSize,
}: {
  items: Option<T>[]
  onSelectValue?: OnSelectValue<T>
  groupStyle: GroupWrapperProps['style']
  textSize: ItemProps<T>['textSize']
  selectedValue?: string | undefined
}) {
  return items.map((option, idx) =>
    option.type === 'group'
      ? renderGroup({
          group: option,
          idx,
          onSelectValue,
          selectedValue,
          groupStyle,
          textSize,
        })
      : renderItem({
          item: option,
          idx,
          onSelectValue,
          textSize,
          isSelected: option.value === selectedValue,
        }),
  )
}

type Props<T extends ItemType> = {
  multiGroup: boolean
  loading?: boolean
  listStyle?: {
    listWrapper: GroupWrapperProps['style']
    size: ItemProps<T>['textSize']
  }
  onSelectValue?: OnSelectValue<T>
  showSearch?: boolean
  onSearchChange?: (query: string) => void
  ItemPresenter?: ItemPresenterComponent<T>
  items: Option<T>[]
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
  shouldFilter?: boolean
}

export function SearchableList<T extends ItemType>({
  multiGroup,
  selectedValue,
  onSelectValue,
  onSearchChange,
  items,
  placeholder,
  showSearch = true,
  loading = false,
  emptyMessage = 'No results',
  listStyle,
  infiniteScroll,
  ItemPresenter,
  /**
   * Normally we do the filtering outside of the component if
   * we have a static list of items. In that case `shouldFilter` is false
   */
  shouldFilter = false,
}: Props<T>) {
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

  const groupStyle = listStyle?.listWrapper ?? 'border'
  const textSize = listStyle?.size ?? 'normal'

  // FIXME: Generic in context provider does not work, casting as any
  return (
    <RenderItemContext.Provider value={{ ItemPresenter: ItemPresenter as any }}>
      <Command
        className='relative flex flex-col gap-y-4 h-full min-h-0'
        shouldFilter={shouldFilter}
      >
        {showSearch ? (
          <SearchInput
            placeholder={placeholder}
            onValueChange={onSearchChange}
          />
        ) : null}
        {loading ? (
          <LoadingList
            groupStyle={groupStyle}
            size='loading'
            multiGroup={multiGroup}
          />
        ) : (
          <Command.List
            asChild
            className='overflow-y-auto custom-scrollbar space-y-4 scrollable-indicator'
          >
            {multiGroup ? (
              <MultiGroupList
                items={items}
                groupStyle={groupStyle}
                textSize={textSize}
                onSelectValue={onSelectValue}
                selectedValue={selectedValue}
              />
            ) : (
              <GroupWrapper style={groupStyle} hidden={items.length === 0}>
                {(items as OptionItem<T>[]).map((item, idx) => (
                  <Item
                    key={idx}
                    value={item.value}
                    textSize={textSize}
                    item={item}
                    onSelectValue={onSelectValue}
                    isSelected={item.value === selectedValue}
                  />
                ))}
              </GroupWrapper>
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

            {/* Infinite loading items once first page is loaded */}
            {items.length > 0 && infiniteScroll?.isLoadingMore && (
              <div className='py-4 w-full flex justify-center'>
                <Icon
                  name='loader'
                  spin
                  size='xlarge'
                  color='foregroundMuted'
                />
              </div>
            )}
          </Command.List>
        )}
      </Command>
    </RenderItemContext.Provider>
  )
}
