'use client'
import { MouseEvent, ReactNode, useCallback, useState } from 'react'

import { Button, ButtonProps } from '../Button'
import { Icon } from '../Icons'
import { type IconProps } from '../Icons'
import { Text } from '../Text'
import { cn } from '../../../lib/utils'

import {
  DropdownMenu as DropdownMenuRoot,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  type ContentProps,
} from './Primitives'

export type TriggerButtonProps = Omit<ButtonProps, 'children'> & {
  label?: string
}
export const TriggerButton = ({
  label,
  variant = 'outline',
  iconProps = { name: 'ellipsis', color: 'foregroundMuted' },
  className: cln,
  ...buttonProps
}: TriggerButtonProps) => {
  const className = !buttonProps.indicator ? (cln ?? 'w-8 px-1') : cln
  return (
    <DropdownMenuTrigger asChild className='flex focus:outline-none'>
      <Button
        asChild
        fullWidth={false}
        className={className}
        variant={variant}
        iconProps={iconProps}
        {...buttonProps}
      >
        {label && <div>{label}</div>}
      </Button>
    </DropdownMenuTrigger>
  )
}

export type MenuOption = {
  label: string
  onClick: () => void
  closeDropdown?: () => void
  onElementClick?: (e: MouseEvent) => void
  type?: 'normal' | 'destructive'
  iconProps?: IconProps
  disabled?: boolean
  lookDisabled?: boolean
  shortcut?: string
  checked?: boolean | undefined
  ellipsis?: boolean
  hidden?: boolean
}
function DropdownItem({
  iconProps,
  onClick,
  closeDropdown,
  onElementClick,
  type = 'normal',
  label,
  shortcut,
  disabled,
  checked,
  ellipsis = false,
}: MenuOption) {
  const onSelect = useCallback(() => {
    if (disabled) return

    onClick()
    closeDropdown?.()
  }, [disabled, onClick, closeDropdown])
  return (
    <DropdownMenuItem
      onClick={onElementClick}
      onSelect={onSelect}
      disabled={disabled}
      className={cn('gap-2 items-center cursor-pointer', {
        'min-w-0': ellipsis,
      })}
    >
      {iconProps ? <Icon {...iconProps} /> : null}
      <div className={cn('w-full', { 'flex min-w-0': ellipsis })}>
        <Text.H5
          noWrap={ellipsis}
          ellipsis={ellipsis}
          color={type === 'destructive' ? 'destructive' : 'foreground'}
        >
          {label}
        </Text.H5>
      </div>
      {shortcut && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
      {checked !== undefined && (
        <div className='flex items-center'>
          {checked ? <Icon name='checkClean' /> : null}
        </div>
      )}
    </DropdownMenuItem>
  )
}

type RenderTriggerProps = { open: boolean }
type TriggerButtonPropsFn = (open: boolean) => TriggerButtonProps
type Props = ContentProps & {
  triggerButtonProps?: TriggerButtonProps | TriggerButtonPropsFn
  trigger?: (renderTriggerProps: RenderTriggerProps) => ReactNode
  title?: string
  width?: 'normal' | 'wide' | 'extraWide'
  options: MenuOption[]
  onOpenChange?: (open: boolean) => void
  controlledOpen?: boolean
}
export function DropdownMenu({
  triggerButtonProps,
  trigger,
  title,
  side,
  sideOffset,
  align,
  alignOffset,
  options,
  onOpenChange,
  controlledOpen,
  width = 'normal',
}: Props) {
  const [open, setOpen] = useState(false)
  const isFn = typeof triggerButtonProps === 'function'
  const closeDropdown = useCallback(() => {
    setOpen(false)
  }, [])
  return (
    <DropdownMenuRoot
      onOpenChange={(newOpen: boolean) => {
        onOpenChange?.(newOpen)
        setOpen(newOpen)
      }}
      open={controlledOpen !== undefined ? controlledOpen : open}
    >
      {triggerButtonProps ? (
        <TriggerButton
          {...(isFn ? triggerButtonProps(open) : triggerButtonProps)}
        />
      ) : trigger ? (
        trigger({ open })
      ) : (
        <TriggerButton />
      )}
      <DropdownMenuPortal>
        <DropdownMenuContent
          side={side}
          sideOffset={sideOffset}
          align={align}
          alignOffset={alignOffset}
          className={cn({
            'w-52': width === 'normal',
            'w-72': width === 'wide',
            'w-96': width === 'extraWide',
          })}
        >
          {title && (
            <>
              <DropdownMenuLabel>{title}</DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          {options
            .filter((option) => !option.hidden)
            .map((option, index) => (
              <DropdownItem
                key={index}
                {...option}
                closeDropdown={closeDropdown}
              />
            ))}
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  )
}

export {
  DropdownMenuRoot,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
}
