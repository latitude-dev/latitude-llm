import type { MouseEvent, ReactNode } from "react"
import { useCallback, useState } from "react"

import { cn } from "../../utils/cn.ts"
import { Button, type ButtonProps } from "../button/button.tsx"
import { Icon } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"

import { Ellipsis } from "lucide-react"
import type { IconProps } from "../icons/icons.tsx"
import {
  type ContentProps,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenu as DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./primitives.tsx"

export type TriggerButtonProps = Omit<ButtonProps, "children"> & {
  label?: string
}

const TriggerButton = ({ label, variant = "outline", className: cln, ...buttonProps }: TriggerButtonProps) => {
  const className = cln ?? "w-8 px-1"
  return (
    <DropdownMenuTrigger asChild className="flex focus:outline-none cursor-pointer">
      <Button asChild={false} className={className} variant={variant} {...buttonProps}>
        {label ? <div>{label}</div> : <Icon icon={Ellipsis} size="sm" color="foregroundMuted" />}
      </Button>
    </DropdownMenuTrigger>
  )
}

export type MenuOption = {
  label: string
  onClick?: () => void
  closeDropdown?: () => void
  onElementClick?: (e: MouseEvent) => void
  type?: "normal" | "destructive"
  iconProps?: IconProps
  disabled?: boolean
  hidden?: boolean
}

function DropdownItem({
  iconProps,
  onClick,
  closeDropdown,
  onElementClick,
  type = "normal",
  label,
  disabled,
}: MenuOption) {
  const onSelect = useCallback(() => {
    if (disabled) return
    onClick?.()
    closeDropdown?.()
  }, [disabled, onClick, closeDropdown])

  return (
    <DropdownMenuItem
      onClick={onElementClick}
      onSelect={onSelect}
      {...(disabled !== undefined ? { disabled } : {})}
      className={cn("gap-2 items-center cursor-pointer", {
        "cursor-auto pointer-events-none": !onClick,
      })}
    >
      {iconProps ? <Icon {...iconProps} /> : null}
      <div className="w-full">
        <Text.H5 color={type === "destructive" ? "destructive" : "foreground"}>{label}</Text.H5>
      </div>
    </DropdownMenuItem>
  )
}

type Props = ContentProps & {
  triggerButtonProps?: TriggerButtonProps
  trigger?: (renderTriggerProps: { open: boolean; setOpen: (open: boolean) => void }) => ReactNode
  title?: string
  width?: "normal" | "wide" | "extraWide"
  options: MenuOption[]
  onOpenChange?: (open: boolean) => void
  controlledOpen?: boolean
}

function DropdownMenu({
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
  width = "normal",
}: Props) {
  const [open, setOpen] = useState(false)
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
        <TriggerButton {...triggerButtonProps} />
      ) : trigger ? (
        trigger({ open, setOpen })
      ) : (
        <TriggerButton />
      )}
      <DropdownMenuPortal>
        <DropdownMenuContent
          {...(side !== undefined ? { side } : {})}
          {...(sideOffset !== undefined ? { sideOffset } : {})}
          {...(align !== undefined ? { align } : {})}
          {...(alignOffset !== undefined ? { alignOffset } : {})}
          className={cn({
            "w-52": width === "normal",
            "w-72": width === "wide",
            "w-96": width === "extraWide",
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
            .map((option) => (
              <DropdownItem key={option.label} {...option} closeDropdown={closeDropdown} />
            ))}
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  )
}

export { DropdownMenu }
