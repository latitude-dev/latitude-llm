'use client'

import { MouseEvent, ReactNode, useCallback, useState } from 'react'
import { Check } from 'lucide-react'

import { Button, type ButtonProps } from '../Button'
import { Icon, type IconProps } from '../Icons'
import Text from '../Text'
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenu as DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
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
  onElementClick?: (e: MouseEvent) => void
  type?: 'normal' | 'destructive'
  iconProps?: IconProps
  disabled?: boolean
  lookDisabled?: boolean
  shortcut?: string
  checked?: boolean | undefined
}
function DropdownItem({
  iconProps,
  onClick,
  onElementClick,
  type = 'normal',
  label,
  shortcut,
  disabled,
  checked,
}: MenuOption) {
  const onSelect = useCallback(() => {
    if (disabled) return

    onClick()
  }, [disabled, onClick])
  return (
    <DropdownMenuItem
      onClick={onElementClick}
      onSelect={onSelect}
      disabled={disabled}
      className='gap-2 items-start cursor-pointer'
    >
      {iconProps ? <Icon {...iconProps} /> : null}
      <div className='w-full'>
        <Text.H5 color={type === 'destructive' ? 'destructive' : 'foreground'}>
          {label}
        </Text.H5>
      </div>
      {shortcut && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
      {checked !== undefined && (
        <div className='flex align-items w-5 h-5'>
          {checked ? <Check className='h-5 w-5' strokeWidth={1.25} /> : null}
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
}: Props) {
  const [open, setOpen] = useState(false)
  const isFn = typeof triggerButtonProps === 'function'
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
          className='w-52'
        >
          {title && (
            <>
              <DropdownMenuLabel>{title}</DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          {options.map((option, index) => (
            <DropdownItem key={index} {...option} />
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
