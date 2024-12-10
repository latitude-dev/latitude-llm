import { DateValue } from '@react-aria/datepicker'
import { CalendarProps } from '@react-aria/calendar'

import { Calendar } from '../../Calendar'
import { DatePickerType } from '../index'
import { SelectOption, StandaloneSelectContent } from '../../Select'

type Props<T extends DateValue> = {
  calendarProps: CalendarProps<T>
  options: SelectOption[]
  type: DatePickerType
  name: string
  relativeValue: string | undefined
  onChangeCalendar: (value: DateValue) => void
  onChangeOption: (value: string) => void
  maxWidth?: number
}

export default function Content<T extends DateValue>({
  type,
  onChangeCalendar,
  onChangeOption,
  calendarProps,
  options,
  relativeValue,
  maxWidth,
}: Props<T>) {
  if (type !== DatePickerType.relative) {
    return (
      <Calendar
        {...calendarProps}
        autoFocus={false}
        value={calendarProps.value}
        onChange={onChangeCalendar}
        maxWidth={maxWidth}
      />
    )
  }

  return (
    <StandaloneSelectContent
      options={options}
      value={relativeValue}
      onChange={onChangeOption}
    />
  )
}
