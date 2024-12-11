'use client'

import { useState } from 'react'
import { addDays, format } from 'date-fns'

import { cn } from '../../../lib/utils'
import { Button } from '../Button'
import { Calendar } from './Primitives'
import { Popover } from '../Popover'
import { Select, SelectOption } from '../Select'
import { RELATIVE_DATES_OPTIONS } from './utils'
import { DateRange } from 'react-day-picker'
import { Icon } from '../Icons'
import { usePresets } from './usePresets'

export type DatePickerMode = 'single' | 'range'
export function DatePicker({ presets }: { presets?: SelectOption[]; mode: DatePickerMode }) {
  const { options } = usePresets({ mode: 'range' })
  const [date, setDate] = useState<DateRange | undefined>({
    from: new Date(2022, 0, 20),
    to: addDays(new Date(2022, 0, 20), 20),
  })

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          variant={'outline'}
          className={cn(
            'w-[240px] justify-start text-left font-normal',
            !date && 'text-muted-foreground',
          )}
        >
          <Icon name='calendar' />

          {date?.from ? (
            date.to ? (
              <>
                {format(date.from, 'LLL dd, y')} -{' '}
                {format(date.to, 'LLL dd, y')}
              </>
            ) : (
              format(date.from, 'LLL dd, y')
            )
          ) : (
            <span>Pick a date</span>
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Content
        align='start'
        className='flex w-auto flex-col space-y-2 p-2'
      >
        <Select
          name='date-preset'
          onChange={(value) => setDate(addDays(new Date(), parseInt(value)))}
          options={presets ?? RELATIVE_DATES_OPTIONS}
        />
        <div className='rounded-md border'>
          <Calendar mode='range' selected={date} onSelect={setDate} />
        </div>
      </Popover.Content>
    </Popover.Root>
  )
}
