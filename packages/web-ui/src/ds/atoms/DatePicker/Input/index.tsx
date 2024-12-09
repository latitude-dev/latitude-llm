import { useLocale } from '@react-aria/i18n'

import { DateValue } from '@react-aria/datepicker'
import { InputDate, type DateInputProps } from '../../InputDate'
import { SelectOption } from '../../Select'
import { RelativeOptionsTrigger } from '../RelativeOptions/Trigger'
import { DatePickerType } from '../index'

export type Props = {
  name: string
  options: SelectOption[]
  type: DatePickerType
  size?: DateInputProps['size']
  value?: DateValue
  relativeValue?: string
  onChange: DateInputProps['onChange']
  autoFocus?: boolean
  onEnter?: () => void
}

export default function DatePickerInput({
  size,
  type,
  name,
  autoFocus,
  onChange,
  value,
  relativeValue,
  options,
  onEnter,
}: Props) {
  const { locale } = useLocale()

  if (type === DatePickerType.absolute) {
    return (
      <InputDate
        locale={locale}
        autoFocus={autoFocus}
        inputSize={size}
        name={name}
        value={value}
        onChange={onChange}
        onEnter={onEnter}
      />
    )
  }
  return (
    <RelativeOptionsTrigger
      selected={options.find((option) => option.value === relativeValue)}
      size={size}
    />
  )
}
