import { Icon, IconProps } from '../../Icons'

import { DatePickerType } from '../index'
import { cn } from '../../../../lib/utils'
import { ReactNode, Ref } from 'react'

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
  onTypeChange?: (type: DatePickerType) => void | undefined
  input: ReactNode
  ref: Ref<HTMLDivElement>
}
export function DateTypePicker({ ref, type, onTypeChange }: Props) {
  return (
    <div
      ref={ref}
      className='flex flex-row items-center gap-x-2 bg-backgroundCode rounded-md'
    >
      {onTypeChange ? (
        <div>
          <DatePickerIcon
            icon='eye'
            selected={type === DatePickerType.relative}
            toggle={() => onTypeChange(DatePickerType.relative)}
          />
          <DatePickerIcon
            icon='filePlus'
            selected={type === DatePickerType.absolute}
            toggle={() => onTypeChange(DatePickerType.absolute)}
          />
        </div>
      ) : null}
    </div>
  )
}
