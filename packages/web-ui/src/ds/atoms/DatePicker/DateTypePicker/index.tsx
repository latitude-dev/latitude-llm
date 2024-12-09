import { Icon, IconProps } from '../../Icons'

import { DatePickerType } from '../index'
import { cn } from '../../../../lib/utils'

type DatePickerIconProps = {
  selected: boolean
  icon: IconProps['name']
  toggle: () => void
}
const DatePickerIcon = ({ selected, icon, toggle }: DatePickerIconProps) => (
  <div
    className={cn('w-6 h-6 rounded', { 'bg-white': selected })}
    onClick={toggle}
  >
    <Icon name={icon} color={selected ? 'primary' : 'foregroundMuted'} />
  </div>
)

type Props = {
  type: DatePickerType
  toggleType: (type: DatePickerType) => void
}
export default function DateTypePicker({ type, toggleType }: Props) {
  return (
    <div className='flex flex-row gap-1 pr-1 items-center justify-center'>
      <DatePickerIcon
        icon='eye'
        selected={type === DatePickerType.relative}
        toggle={() => toggleType(DatePickerType.relative)}
      />
      <DatePickerIcon
        icon='filePlus'
        selected={type === DatePickerType.absolute}
        toggle={() => toggleType(DatePickerType.absolute)}
      />
    </div>
  )
}
