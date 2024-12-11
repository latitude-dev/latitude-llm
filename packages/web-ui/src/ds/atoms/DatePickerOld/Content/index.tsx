import { DateValue } from '@react-aria/datepicker'
import { CalendarProps } from '@react-aria/calendar'

import { Calendar } from '../../Calendar'
import { DatePickerType } from '../index'
import { SelectOption } from '../../Select'
import { useSelectItemStyles } from '../../Select/Primitives'
import { useCallback } from 'react'

function RelativeOptionItem({
  value,
  label,
  onClick,
}: {
  label: string
  value: unknown
  onClick: (value: string) => void
}) {
  const styles = useSelectItemStyles()
  const onClickItem = useCallback(() => {
    onClick(String(value))
  }, [onClick, value])
  return (
    <button onClick={onClickItem} className={styles}>
      {label}
    </button>
  )
}

type RelativeProps = {
  options: SelectOption[]
  onChangeOption: (value: string) => void
  relativeValue: string | undefined
}
function RelativeOptions({ options, onChangeOption }: RelativeProps) {
  return (
    <ul className='max-h-80 w-72 custom-scrollbar'>
      {options.map((option) => (
        <RelativeOptionItem
          key={option.value?.toString()}
          value={option.value}
          label={option.label}
          onClick={onChangeOption}
        />
      ))}
    </ul>
  )
}

type Props<T extends DateValue> = RelativeProps & {
  calendarProps: CalendarProps<T>
  type: DatePickerType
  name: string
  onChangeCalendar: (value: DateValue) => void
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
    <RelativeOptions
      options={options}
      onChangeOption={onChangeOption}
      relativeValue={relativeValue}
    />
  )
}
