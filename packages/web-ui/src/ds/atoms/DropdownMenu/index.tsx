import { ReactNode, useCallback, useState } from 'react'

import { Button, type ButtonProps } from '$ui/ds/atoms/Button'
import Text from '$ui/ds/atoms/Text'

import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  DropdownMenu as Root,
  type ContentProps,
} from './Primitives'

export type TriggerButtonProps = Omit<ButtonProps, 'children'> & {
  label?: string
}
const TriggerButton = ({
  label,
  variant = 'ghost',
  icon = { name: 'ellipsisVertical', props: { color: 'foregroundMuted' } },
  ...buttonProps
}: TriggerButtonProps) => {
  return (
    <DropdownMenuTrigger asChild className='flex focus:outline-none'>
      <Button
        asChild
        size='small'
        variant={variant}
        icon={icon}
        {...buttonProps}
      >
        <div>{label ? label : null}</div>
      </Button>
    </DropdownMenuTrigger>
  )
}

export type MenuOption = {
  label: string
  onClick: () => void
  type?: 'normal' | 'destructive'
  icon?: ReactNode
  disabled?: boolean
  shortcut?: string
}
function DropdownItem({
  icon,
  onClick,
  type = 'normal',
  label,
  shortcut,
  disabled,
}: MenuOption) {
  const onSelect = useCallback(() => {
    if (disabled) return
    onClick()
  }, [disabled, onClick])
  return (
    <DropdownMenuItem onSelect={onSelect} disabled={disabled}>
      {icon}
      <Text.H5M color={type === 'destructive' ? 'destructive' : 'foreground'}>
        {label}
      </Text.H5M>
      {shortcut && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
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
    <Root
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
    </Root>
  )
}
