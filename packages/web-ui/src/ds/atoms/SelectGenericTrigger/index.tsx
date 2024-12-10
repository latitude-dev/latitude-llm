import { ReactNode, Ref } from 'react'
import { isString } from 'lodash-es'
import { TextColor } from '../../tokens'
import { Button, type ButtonProps } from '../Button'
import { cn } from '../../../lib/utils'
import Text from '../Text'
import { Icon, type IconProps } from '../Icons'

export function SelectGenericTrigger({
  children,
  color,
  showIcon = true,
  buttonVariant = 'outline',
  className,
  iconProps,
}: {
  children: string | ReactNode
  showIcon?: boolean
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
        {isString(children) ? (
          <Text.H5 color={color} noWrap ellipsis>
            {children}
          </Text.H5>
        ) : (
          children
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
