'use client'

import { format } from 'date-fns'
import { useCallback, useMemo, useState } from 'react'

import { DateRange as ReactDatePickerRange } from 'react-day-picker'
import { RelativeDate } from '@latitude-data/constants/relativeDates'
import { cn } from '../../../../lib/utils'
import { Button } from '../../Button'
import { Popover, PopoverContentProps } from '../../Popover'
import { Select } from '../../Select'
import { Calendar } from '../Primitives'
import { usePresets } from './usePresets'

export type DatePickerMode = 'single' | 'range'
export type DateRange = ReactDatePickerRange

function renderLabel({
  range,
  selectedPreset,
  placeholder,
  singleDatePrefix,
}: {
  range: DateRange | undefined
  placeholder: string
  selectedPreset?: { label: string; value: RelativeDate }
  singleDatePrefix?: string
}) {
  if (selectedPreset) return { label: selectedPreset.label, selected: true }

  if (range?.from) {
    const rangeSelection = range.to
      ? `${format(range.from, 'LLL dd, y')} - ${format(range.to, 'LLL dd, y')}`
      : singleDatePrefix
        ? `${singleDatePrefix} ${format(range.from, 'LLL dd, y')}`
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
  disabled = false,
  align = 'start',
  singleDatePrefix,
}: {
  showPresets?: boolean
  initialRange?: DateRange
  onChange?: (range: DateRange | undefined) => void
  onCloseChange?: (range: DateRange | undefined) => void
  closeOnPresetSelect?: boolean
  placeholder?: string
  disabled?: boolean
  align?: PopoverContentProps['align']
  singleDatePrefix?: string
}) {
  const [open, setOpen] = useState(false)
  const [range, setRange] = useState<DateRange | undefined>(initialRange)
  const { options, buildPreset, selectedPreset } = usePresets({
    range,
    showPresets,
  })
  const selection = useMemo(
    () => renderLabel({ range, selectedPreset, placeholder, singleDatePrefix }),
    [range, selectedPreset, placeholder, singleDatePrefix],
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
    [buildPreset, onChangeProp, onCloseChange, closeOnPresetSelect, range],
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
            'justify-start text-left font-normal',
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
        align={align}
        className='flex w-auto flex-col'
        maxHeight='none'
      >
        {showPresets ? (
          <Select
            name='date-preset'
            onChange={onPresetSelect}
            value={selectedPreset?.value}
            options={options}
            disabled={disabled}
          />
        ) : null}
        <div>
          <Calendar
            mode='range'
            selected={range}
            onSelect={setRange}
            disabled={disabled}
          />
          <div className='flex justify-end gap-x-2' onClick={clearAndClose}>
            <Button variant='ghost' disabled={disabled}>
              Clear dates
            </Button>
          </div>
        </div>
      </Popover.Content>
    </Popover.Root>
  )
}
