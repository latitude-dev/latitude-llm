import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentPropsWithRef } from "react"

import { font } from "../../tokens/font.ts"
import { cn } from "../../utils/cn.ts"
import { DotIndicator, type DotIndicatorProps } from "../dot-indicator/dot-indicator.tsx"
import { Icon, type IconProps } from "../icons/icons.tsx"

const badgeVariants = cva(
  // No `self-start` here: it would win over a row parent's `items-center` and pin the badge
  // to the top instead of centering it. A badge that must not stretch in a `flex-col` parent
  // takes `self-start` via `className` at that call site instead.
  "inline-flex shrink-0 items-center rounded-md font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        yellow: "bg-yellow text-foreground hover:bg-yellow/80",
        purple: "bg-purple text-purple-foreground hover:bg-purple/80",
        accent: "bg-accent text-accent-foreground hover:bg-accent/80",
        success: "bg-green-500 text-success-foreground hover:bg-green-500/80",
        successMuted: "bg-success-muted text-success-muted-foreground hover:bg-success-muted/80",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/80",
        destructiveMuted: "bg-destructive-muted text-destructive-muted-foreground hover:bg-destructive-muted/80",
        warningMuted: "bg-warning-muted text-warning-muted-foreground hover:bg-warning-muted/80",
        muted: "bg-muted text-muted-foreground hover:bg-muted/80",
        // The only variants that keep a border — the outline family has no fill, so the
        // border is what makes it a badge rather than bare text.
        outline: "border text-foreground",
        outlineMuted: "border border-muted-foreground/30 text-muted-foreground",
        outlineAccent: "border border-accent-foreground/30 text-accent-foreground",
        outlinePurple: "border border-purple-foreground/30 text-purple-foreground",
        outlineSuccessMuted: "border border-success-muted-foreground/30 text-success-muted-foreground",
        outlineDestructiveMuted: "border border-destructive-muted-foreground/30 text-destructive-muted-foreground",
        outlineWarningMuted: "border border-warning-muted-foreground/30 text-warning-muted-foreground",
        white: "bg-white text-primary hover:bg-white/80",
      },
      shape: {
        default: "max-h-5",
        rounded: "rounded-full",
      },
      size: {
        large: "text-[0.8rem] font-medium py-3.5 px-2.5 rounded-lg",
        normal: "text-xs py-2 px-1.5 max-h-5",
        small: `${font.size.h7} min-h-5 max-h-5 min-w-4 px-1`,
      },
    },
    defaultVariants: {
      variant: "default",
      shape: "default",
      size: "normal",
    },
  },
)

export interface BadgeProps extends ComponentPropsWithRef<"div">, VariantProps<typeof badgeVariants> {
  ellipsis?: boolean
  /** The label is always `whitespace-nowrap`; this only lets the badge shrink (`min-w-0`) so a sibling `ellipsis` can clip it. */
  noWrap?: boolean
  centered?: boolean
  /** Uppercase label text (tracking slightly widened for readability). */
  uppercase?: boolean
  iconProps?: Omit<IconProps, "size"> & {
    placement: "start" | "end"
  }
  /** Renders a leading status dot inside the badge (before icons and label). */
  indicatorProps?: DotIndicatorProps
  userSelect?: boolean
  disabled?: boolean
}

function Badge({
  ref,
  className,
  variant,
  shape,
  size,
  ellipsis = false,
  noWrap = false,
  centered = false,
  uppercase = false,
  disabled = false,
  userSelect = false,
  children,
  iconProps,
  indicatorProps,
  ...props
}: BadgeProps) {
  return (
    <div
      ref={ref}
      className={cn(badgeVariants({ variant, shape, size }), className, {
        "opacity-50": disabled,
        "flex-row max-h-none gap-x-1 py-px": !!iconProps || !!indicatorProps,
        "justify-center": centered,
        "select-none": !userSelect,
        "min-w-0": ellipsis || noWrap,
        "uppercase tracking-wide": uppercase,
      })}
      {...props}
    >
      {indicatorProps ? <DotIndicator {...indicatorProps} /> : null}
      {iconProps && iconProps.placement === "start" ? <Icon weight="L" {...iconProps} size="xs" /> : null}
      <span
        className={cn("whitespace-nowrap", {
          truncate: ellipsis,
        })}
      >
        {children}
      </span>
      {iconProps && iconProps.placement === "end" ? <Icon weight="L" {...iconProps} size="xs" /> : null}
    </div>
  )
}

export { Badge, badgeVariants }
