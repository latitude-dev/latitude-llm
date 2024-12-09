'use client'

import { useCallback, useState } from 'react'
import { format, formatISO } from 'date-fns'

import { cn } from '../../../../lib/utils'
import { Button } from '../../Button'
import { Calendar } from '../Primitives'
import { Popover } from '../../Popover'
import { Select } from '../../Select'
import { DateRange } from 'react-day-picker'
import { usePresets } from './usePresets'
import { RelativeDate } from '@latitude-data/core/browser'

export type DatePickerMode = 'single' | 'range'

type DateRangeValue = {
  raw: {
    from: Date
    to: Date
  }
  iso8601: {
    from: string
    to: string
  }
}

type CallbackFn = ((value: DateRangeValue) => void) | undefined
function formatRange(range: DateRange | undefined, callback: CallbackFn) {
  if (!range?.to || !range?.from) return
  const from = range.from
  const to = range.to
  const value = {
    raw: { from, to },
    iso8601: { from: formatISO(from), to: formatISO(to) },
  }
  callback?.(value)
}

export function DatePickerRange({
  showPresets,
  onCloseChange,
  onChange: onChangeProp,
  placeholder = 'Pick a date',
}: {
  showPresets?: boolean
  onChange?: (range: DateRangeValue) => void
  onCloseChange?: (range: DateRangeValue) => void
  placeholder?: string
}) {
  const { options, buildPreset } = usePresets()
  const [range, setRange] = useState<DateRange | undefined>()

  const onChange = useCallback(
    (range: DateRange) => {
      setRange(range)
      formatRange(range, onChangeProp)
    },
    [onChangeProp],
  )

  const onPresetSelect = useCallback(
    (preset: RelativeDate) => {
      onChange(buildPreset(preset))
    },
    [onChange, buildPreset],
  )

  return (
    <Popover.Root
      onOpenChange={(isOpen) => {
        if (isOpen) return

        formatRange(range, onCloseChange)
      }}
    >
      <Popover.Trigger asChild>
        <Button
          ellipsis
          variant='outline'
          className={cn(
            'w-72 justify-start text-left font-normal',
            !range && 'text-muted-foreground',
          )}
          iconProps={{
            name: 'calendar',
            color: range ? 'foreground' : 'foregroundMuted',
          }}
        >
          {range?.from ? (
            range.to ? (
              <>
                {format(range.from, 'LLL dd, y')} -{' '}
                {format(range.to, 'LLL dd, y')}
              </>
            ) : (
              format(range.from, 'LLL dd, y')
            )
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </Popover.Trigger>
      <Popover.Content
        align='start'
        className='flex w-auto flex-col'
        maxHeight='none'
      >
        {showPresets ? (
          <Select
            name='date-preset'
            onChange={onPresetSelect}
            options={options}
          />
        ) : null}
        <Calendar mode='range' selected={range} onSelect={setRange} />
      </Popover.Content>
    </Popover.Root>
  )
}
