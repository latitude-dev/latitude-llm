'use client'

import { useCallback, useState, useMemo } from 'react'
import { format } from 'date-fns'

import { cn } from '../../../../lib/utils'
import { Button } from '../../Button'
import { Calendar } from '../Primitives'
import { Popover } from '../../Popover'
import { Select } from '../../Select'
import { DateRange } from 'react-day-picker'
import { usePresets } from './usePresets'
import { RelativeDate } from '@latitude-data/core/browser'

export type DatePickerMode = 'single' | 'range'

function renderLabel({
  range,
  selectedPreset,
  placeholder,
}: {
  range: DateRange | undefined
  placeholder: string
  selectedPreset?: { label: string; value: RelativeDate }
}) {
  if (selectedPreset) return { label: selectedPreset.label, selected: true }

  if (range?.from) {
    const rangeSelection = range.to
      ? `${format(range.from, 'LLL dd, y')} - ${format(range.to, 'LLL dd, y')}`
      : format(range.from, 'LLL dd, y')
    return { label: rangeSelection, selected: true }
  }

  return { label: placeholder, selected: false }
}

export function DatePickerRange({
  showPresets,
  initialRange,
  onCloseChange,
  onChange: onChangeProp,
  placeholder = 'Pick a date',
  closeOnPresetSelect = true,
}: {
  showPresets?: boolean
  initialRange?: DateRange
  onChange?: (range: DateRange | undefined) => void
  onCloseChange?: (range: DateRange | undefined) => void
  closeOnPresetSelect?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<DateRange | undefined>(initialRange)
  const { options, buildPreset, selectedPreset } = usePresets({
    range,
    showPresets,
  })
  const selection = useMemo(
    () => renderLabel({ range, selectedPreset, placeholder }),
    [range, selectedPreset, placeholder],
  )

  const onPresetSelect = useCallback(
    (preset: RelativeDate) => {
      const newRange = buildPreset(preset)
      setRange(newRange)

      if (closeOnPresetSelect) {
        onCloseChange?.(newRange)
        setOpen(false)
      } else {
        onChangeProp?.(range)
      }
    },
    [buildPreset, onChangeProp, onCloseChange, closeOnPresetSelect],
  )

  const clearAndClose = useCallback(() => {
    setRange(undefined)
    setOpen(false)
    onCloseChange?.(undefined)
  }, [onCloseChange])

  return (
    <Popover.Root
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen)

        if (isOpen) return

        onCloseChange?.(range)
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
            color: selection.selected ? 'primary' : 'foregroundMuted',
            darkColor: selection.selected ? 'foreground' : 'foregroundMuted',
          }}
        >
          <span
            className={cn({
              'text-primary dark:text-foreground': selection.selected,
            })}
          >
            {selection.label}
          </span>
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
            value={selectedPreset?.value}
            options={options}
          />
        ) : null}
        <div>
          <Calendar mode='range' selected={range} onSelect={setRange} />
          <div className='flex justify-end gap-x-2' onClick={clearAndClose}>
            <Button variant='ghost'>Clear dates</Button>
          </div>
        </div>
      </Popover.Content>
    </Popover.Root>
  )
}
