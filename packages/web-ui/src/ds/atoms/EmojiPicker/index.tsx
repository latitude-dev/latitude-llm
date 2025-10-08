'use client'

import {
  type EmojiPickerListCategoryHeaderProps,
  type EmojiPickerListEmojiProps,
  type EmojiPickerListRowProps,
  EmojiPicker as EmojiPickerPrimitive,
} from 'frimousse'
import { LoaderIcon, SearchIcon } from 'lucide-react'
import type * as React from 'react'

import { cn } from '../../../lib/utils'
import { Popover } from '../Popover'
import { CSSProperties, useState, useCallback } from 'react'

function EmojiPickerRoot({
  className,
  ...props
}: React.ComponentProps<typeof EmojiPickerPrimitive.Root>) {
  return (
    <EmojiPickerPrimitive.Root
      className={cn(
        'bg-popover text-popover-foreground isolate flex h-full w-fit flex-col overflow-hidden rounded-md',
        className,
      )}
      data-slot='emoji-picker'
      {...props}
    />
  )
}

function EmojiPickerSearch({
  className,
  ...props
}: React.ComponentProps<typeof EmojiPickerPrimitive.Search>) {
  return (
    <div
      className={cn('flex h-9 items-center gap-2 border-b px-3', className)}
      data-slot='emoji-picker-search-wrapper'
    >
      <SearchIcon className='size-4 shrink-0 opacity-50' />
      <EmojiPickerPrimitive.Search
        className='outline-hidden placeholder:text-muted-foreground flex h-10 w-full rounded-md bg-transparent py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-opacity-0'
        data-slot='emoji-picker-search'
        {...props}
      />
    </div>
  )
}

function EmojiPickerRow({ children, ...props }: EmojiPickerListRowProps) {
  return (
    <div {...props} className='scroll-my-1 px-1' data-slot='emoji-picker-row'>
      {children}
    </div>
  )
}

function EmojiPickerEmoji({
  emoji,
  className,
  ...props
}: EmojiPickerListEmojiProps) {
  return (
    <button
      {...props}
      className={cn(
        'relative flex aspect-square size-8 items-center justify-center overflow-hidden rounded-md text-xl data-[active]:bg-neutral-100/80 dark:data-[active]:bg-neutral-800/80 before:absolute before:inset-0 before:-z-1 before:hidden before:items-center before:justify-center before:text-[2.5em] before:blur-lg before:saturate-200 before:content-(--emoji) data-[active]:before:flex',
        className,
      )}
      style={
        {
          '--emoji': `"${emoji.emoji}"`,
        } as CSSProperties
      }
      data-slot='emoji-picker-emoji'
    >
      {emoji.emoji}
    </button>
  )
}

function EmojiPickerCategoryHeader({
  category,
  ...props
}: EmojiPickerListCategoryHeaderProps) {
  return (
    <div
      {...props}
      className='bg-popover text-muted-foreground px-3 pb-2 pt-3.5 text-xs leading-none'
      data-slot='emoji-picker-category-header'
    >
      {category.label}
    </div>
  )
}

function EmojiPickerContent({
  className,
  ...props
}: React.ComponentProps<typeof EmojiPickerPrimitive.Viewport>) {
  return (
    <EmojiPickerPrimitive.Viewport
      className={cn('outline-hidden relative flex-1', className)}
      data-slot='emoji-picker-viewport'
      {...props}
    >
      <EmojiPickerPrimitive.Loading
        className='absolute inset-0 flex items-center justify-center text-muted-foreground'
        data-slot='emoji-picker-loading'
      >
        <LoaderIcon className='size-4 animate-spin' />
      </EmojiPickerPrimitive.Loading>
      <EmojiPickerPrimitive.Empty
        className='absolute inset-0 flex items-center justify-center text-muted-foreground text-sm'
        data-slot='emoji-picker-empty'
      >
        No emoji found.
      </EmojiPickerPrimitive.Empty>
      <EmojiPickerPrimitive.List
        className='select-none pb-1'
        components={{
          Row: EmojiPickerRow,
          Emoji: EmojiPickerEmoji,
          CategoryHeader: EmojiPickerCategoryHeader,
        }}
        data-slot='emoji-picker-list'
      />
    </EmojiPickerPrimitive.Viewport>
  )
}

function EmojiPickerFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'max-w-(--frimousse-viewport-width) flex w-full min-w-0 items-center gap-1 border-t p-2',
        className,
      )}
      data-slot='emoji-picker-footer'
      {...props}
    >
      <EmojiPickerPrimitive.ActiveEmoji>
        {({ emoji }) =>
          emoji ? (
            <>
              <div className='flex size-7 flex-none items-center justify-center text-lg'>
                {emoji.emoji}
              </div>
              <span className='text-secondary-foreground truncate text-xs'>
                {emoji.label}
              </span>
            </>
          ) : (
            <span className='text-muted-foreground ml-1.5 flex h-7 items-center truncate text-xs'>
              Select an emoji…
            </span>
          )
        }
      </EmojiPickerPrimitive.ActiveEmoji>
    </div>
  )
}

export function EmojiPicker({
  searchable = true,
  showFooter = true,
  closeOnSelect = true,
  children,
  onEmojiSelect,
  ...props
}: React.ComponentProps<typeof EmojiPickerPrimitive.Root> & {
  searchable?: boolean
  showFooter?: boolean
  closeOnSelect?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const handleEmojiSelect = useCallback<
    NonNullable<
      React.ComponentProps<typeof EmojiPickerPrimitive.Root>['onEmojiSelect']
    >
  >(
    (...args) => {
      onEmojiSelect?.(...args)
      if (closeOnSelect) setOpen(false)
    },
    [onEmojiSelect, closeOnSelect],
  )

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Content className='p-0'>
        <EmojiPickerRoot
          {...props}
          onEmojiSelect={handleEmojiSelect}
          className='min-h-[200px]'
        >
          {searchable ? <EmojiPickerSearch /> : null}
          <EmojiPickerContent />
          {showFooter ? <EmojiPickerFooter /> : null}
        </EmojiPickerRoot>
      </Popover.Content>
    </Popover.Root>
  )
}
