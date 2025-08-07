'use client'

import { DayPicker } from 'react-day-picker'

import { cn } from '../../../../lib/utils'
import { Icon } from '../../Icons'
import { buttonVariants } from '../../Button'
import type { ComponentProps } from 'react'

export type CalendarProps = ComponentProps<typeof DayPicker>
const RANGE_SELECTED_CLASS = cn(
  '!bg-foreground !text-background',
  'hover:bg-foreground hover:text-background',
  'focus:bg-foreground focus:text-background',
)

function Calendar({ classNames, showOutsideDays = true, ...props }: CalendarProps) {
  return (
    <DayPicker
      captionLayout='dropdown'
      showOutsideDays={showOutsideDays}
      modifiersClassNames={{
        today: '!bg-primary !text-primary-foreground',
        range_start: RANGE_SELECTED_CLASS,
        range_end: RANGE_SELECTED_CLASS,
      }}
      classNames={{
        months: 'flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0',
        month: 'space-y-4',
        caption: 'flex justify-center pt-1 relative items-center',
        caption_label: 'text-sm font-medium',
        nav: 'space-x-1 flex items-center',
        nav_button: cn(
          buttonVariants({ variant: 'outline' }),
          'h-6 w-6 bg-transparent p-0 opacity-50 hover:opacity-100',
        ),
        nav_button_previous: 'absolute left-1',
        nav_button_next: 'absolute right-1',
        table: 'w-full border-collapse space-y-1',
        head_row: 'flex',
        head_cell: 'text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]',
        row: 'flex w-full mt-2',
        cell: cn(
          'h-9 w-9 text-center text-sm p-0 relative',
          '[&:has([aria-selected].day-range-end)]:rounded-r-md',
          'first:[&:has([aria-selected])]:rounded-l-md',
          'last:[&:has([aria-selected])]:rounded-r-md',
          'focus-within:relative focus-within:z-20',
          '[&:has([aria-selected])]:bg-gray-50',
          'dark:[&:has([aria-selected])]:bg-secondary',
          '[&:has([aria-selected])]:text-foreground',
        ),
        day: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-9 w-9 p-0 font-normal aria-selected:opacity-100',
        ),
        day_disabled: 'text-muted-foreground opacity-50',
        day_hidden: 'invisible',
        ...classNames,
      }}
      components={{
        IconLeft: (_p) => <Icon name='chevronLeft' className='h-4 w-4' />,
        IconRight: (_p) => <Icon name='chevronRight' className='h-4 w-4' />,
      }}
      {...props}
    />
  )
}
Calendar.displayName = 'Calendar'

export { Calendar }
