import { ChevronDownIcon } from "lucide-react"
import type { ReactNode, Ref } from "react"
import { cn } from "../../utils/cn.ts"
import { Button, type ButtonProps } from "../button/button.tsx"
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenu as DropdownMenuRoot,
  DropdownMenuTrigger,
} from "../dropdown-menu/primitives.tsx"
import { Icon } from "../icons/icons.tsx"
import { Text } from "../text/text.tsx"

export interface SplitButtonAction {
  /** Visible content for both the primary half (when this is `actions[0]`) and the dropdown row. */
  readonly content: ReactNode
  /** Optional leading icon rendered in front of `content`. */
  readonly icon?: ReactNode
  readonly onClick: () => void
  readonly disabled?: boolean
}

export interface SplitButtonProps {
  readonly variant?: ButtonProps["variant"]
  readonly size?: ButtonProps["size"]
  /** Disables the entire control — both the primary action and the chevron menu. */
  readonly disabled?: boolean
  /** Pulses the primary half. The chevron stays clickable so other actions remain accessible. */
  readonly isLoading?: boolean
  readonly actions: readonly [SplitButtonAction, ...SplitButtonAction[]]
  readonly chevronAriaLabel?: string
  readonly className?: string
  readonly ref?: Ref<HTMLDivElement>
}

/**
 * A two-part button: a primary half that fires `actions[0].onClick`, joined to a chevron half that
 * opens a dropdown listing the *remaining* actions (the primary is already accessible from the
 * left half so it's omitted from the menu). When only one action is provided, the chevron half
 * is hidden entirely. Per-action `disabled` propagates so individual menu items can be locked
 * while siblings stay interactive.
 */
export function SplitButton({
  variant = "outline",
  size = "sm",
  disabled,
  isLoading,
  actions,
  chevronAriaLabel = "More actions",
  className,
  ref,
}: SplitButtonProps) {
  const primary = actions[0]
  const extras = actions.slice(1)
  const primaryDisabled = !!(disabled || primary.disabled)
  const hasExtras = extras.length > 0

  return (
    <div ref={ref} className={cn("inline-flex items-stretch", className)}>
      <Button
        variant={variant}
        size={size}
        disabled={primaryDisabled}
        {...(isLoading ? { isLoading: true } : {})}
        onClick={primary.onClick}
        className={cn({ "rounded-r-none": hasExtras })}
      >
        {primary.icon ?? null}
        {primary.content}
      </Button>
      {hasExtras ? (
        <DropdownMenuRoot modal={false}>
          <DropdownMenuTrigger asChild {...(disabled ? { disabled: true } : {})}>
            <Button
              variant={variant}
              size={size}
              disabled={!!disabled}
              className="rounded-l-none border-l-0 px-1.5"
              aria-label={chevronAriaLabel}
            >
              <Icon icon={ChevronDownIcon} size="xs" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuPortal>
            <DropdownMenuContent align="end" className="w-56">
              {extras.map((action, index) => (
                <DropdownMenuItem
                  key={index}
                  disabled={!!(action.disabled || disabled)}
                  onSelect={() => action.onClick()}
                  className="gap-2"
                >
                  {action.icon ?? null}
                  <Text.H5 className="flex-1">{action.content}</Text.H5>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenuPortal>
        </DropdownMenuRoot>
      ) : null}
    </div>
  )
}
