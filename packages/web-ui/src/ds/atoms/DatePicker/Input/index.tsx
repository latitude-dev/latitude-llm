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
  isOpen?: boolean | undefined
}

export default function DatePickerInput({
  isOpen,
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

  console.log("IS_OPEN_INPIUT", isOpen)
  if (type === DatePickerType.absolute) {
    return (
      <InputDate
        isOpen={isOpen}
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
