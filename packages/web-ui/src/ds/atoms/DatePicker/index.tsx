'use client'

import { Popover } from '../Popover'
import { CalendarDate } from '@internationalized/date'
import { DateValue, useDatePicker } from '@react-aria/datepicker'
import { InputProps as GenericInputProps } from '../Input'
import { SelectOption } from '../Select'
import { useDatePickerState } from '@react-stately/datepicker'
import { useCallback, useEffect, useRef, useState } from 'react'

import { RELATIVE_DATES_OPTIONS, safeParseDate, safeParseValue } from './utils'
import DatePickerInput, { Props as InputProps } from './Input'
import { DateTypePicker } from './DateTypePicker'
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
  onTypeChange: onTypeChangeProp,
  options = RELATIVE_DATES_OPTIONS,
  relativeValue,
  size = 'normal',
  value: inputValue,
  type: initialType = DatePickerType.absolute,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [type, setType] = useState(initialType)
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
  const onTypeChange = useCallback(
    (newType: DatePickerType) => {
      setType(newType)
      onTypeChangeProp?.(newType)
    },
    [onTypeChangeProp],
  )
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
      <DateTypePicker
        ref={ref}
        type={type}
        onTypeChange={onTypeChange}
        input={
          <Popover.Trigger>
            <DatePickerInput
              {...inputProps}
              isOpen={state.isOpen}
              onEnter={() => {
                commitChange()
              }}
            />
          </Popover.Trigger>
        }
      />
      <Popover.Content
        align='start'
        scrollable={false}
        avoidCollisions={false}
        sideOffset={type === DatePickerType.absolute ? 4 : 1}
      >
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
