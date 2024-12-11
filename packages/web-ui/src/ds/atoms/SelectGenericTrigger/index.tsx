import { ReactNode, Ref } from 'react'
import { isString } from 'lodash-es'
import { TextColor } from '../../tokens'
import { Button, type ButtonProps } from '../Button'
import { cn } from '../../../lib/utils'
import Text from '../Text'
import { Icon, type IconProps } from '../Icons'

export function SelectGenericTrigger({
  label,
  color = 'foreground',
  showIcon = true,
  placeholder = 'Select an option',
  buttonVariant = 'outline',
  className,
  iconProps,
}: {
  label: string | ReactNode | undefined
  showIcon?: boolean
  placeholder?: string
  buttonVariant?: ButtonProps['variant']
  className?: string
  iconProps?: Pick<IconProps, 'name' | 'color'>
  color?: TextColor
  ref?: Ref<HTMLButtonElement>
}) {
  const iconName = iconProps?.name ?? 'chevronsUpDown'
  const iconColor = iconProps?.color ?? 'foregroundMuted'
  return (
    <Button
      variant={buttonVariant}
      ellipsis
      className={cn(className)}
      htmlTag='span'
    >
      <div className='flex flex-row justify-between items-center w-full gap-x-2'>
        {!label || isString(label) ? (
          <Text.H5 color={label ? color : 'foregroundMuted'} noWrap ellipsis>
            {label ?? placeholder}
          </Text.H5>
        ) : (
          label
        )}
        {showIcon ? (
          <div className='flex-none'>
            <Icon name={iconName} color={iconColor} />
          </div>
        ) : null}
      </div>
    </Button>
  )
}
