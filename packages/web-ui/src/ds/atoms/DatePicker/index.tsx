'use client'

import { Popover } from '../Popover'
import { CalendarDate } from '@internationalized/date'
import { DateValue, useDatePicker } from '@react-aria/datepicker'
import { InputProps as GenericInputProps } from '../Input'
import { SelectOption } from '../Select'
import { useDatePickerState } from '@react-stately/datepicker'
import { useEffect, useRef, useState } from 'react'

import { safeParseDate, safeParseValue } from './utils'
import DatePickerInput, { Props as InputProps } from './Input'
import DateTypePicker from './DateTypePicker'
import Content from './Content'

export const DATE_PICKER_POPOVER_STYLES =
  'outline-none flex flex-col gap-2 p-2 bg-white rounded-2xl shadow-2p animate-slideDownAndFade'
export const TRIGGER_STYLES = 'w-0 flex-1 focus-visible:outline-0'

type Props = {
  options?: SelectOption[]
  name: string
  value?: string
  relativeValue?: string
  onChange: (value: string) => void
  onTypeChange?: (type: DatePickerType) => void
  size?: GenericInputProps['size']
  type?: DatePickerType
  onOpenChange?: (open: boolean) => void
  maxWidth?: number
}

export const CALENDAR_WIDTH = 220
export enum DatePickerType {
  absolute = 'absolute_date',
  relative = 'relative_date',
}

export function DatePicker({
  maxWidth,
  name,
  onChange,
  onOpenChange,
  onTypeChange,
  options = [],
  relativeValue,
  size = 'normal',
  value: inputValue,
  type = DatePickerType.absolute,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [value, setValue] = useState(safeParseValue(inputValue))
  const [relative, setRelative] = useState(relativeValue)
  const state = useDatePickerState({ value })
  const { calendarProps, fieldProps } = useDatePicker(
    { 'aria-label': name },
    state,
    ref,
  )
  useEffect(() => {
    if (relative === relativeValue) return

    setRelative(relativeValue)
  }, [relativeValue, relative])
  const inputProps: InputProps = {
    ...fieldProps,
    size,
    name,
    type,
    value,
    relativeValue: relative,
    options,
    onChange: (date: DateValue | null) => {
      setValue(date as CalendarDate)
    },
  }
  const commitDateChange = (date: DateValue) => {
    setValue(date)
    const parsed = safeParseDate(date)

    if (!parsed) return
    onChange(parsed)
  }
  const commitRelativeChange = (value: string) => {
    setRelative(value)
    onChange(value)
  }
  const onChangeCalendar = (date: DateValue) => {
    commitDateChange(date)
  }
  const onChangeOption = (value: string) => {
    commitRelativeChange(value)
  }
  const commitChange = () => {
    if (type === DatePickerType.absolute && value) {
      commitDateChange(value)
    } else if (type === DatePickerType.relative && relative) {
      commitRelativeChange(relative)
    }
  }

  console.log('DATE_PICKER_IS_OPEN', state.isOpen)

  return (
    <Popover.Root
      open={state.isOpen}
      onOpenChange={(newOpen: boolean) => {
        // When closing the popover we call `onChange` prop so the user
        // of this DatePicker receive final date picked by the person
        if (!newOpen) {
          commitChange()
        }

        onOpenChange?.(newOpen)
        state.setOpen(newOpen)
      }}
    >
      <Popover.Trigger asChild>
        <div ref={ref} className='flex flex-row items-center gap-x-2'>
          <DatePickerInput
            {...inputProps}
            isOpen={state.isOpen}
            onEnter={() => {
              commitChange()
            }}
          />
          {onTypeChange && (
            <DateTypePicker type={type} toggleType={onTypeChange} />
          )}
        </div>
      </Popover.Trigger>
      <Popover.Content align='end' scrollable={false} avoidCollisions={false}>
        <Content
          maxWidth={maxWidth}
          options={options}
          calendarProps={calendarProps}
          type={type}
          name={name}
          onChangeCalendar={onChangeCalendar}
          onChangeOption={onChangeOption}
          relativeValue={relative}
        />
      </Popover.Content>
    </Popover.Root>
  )
}
