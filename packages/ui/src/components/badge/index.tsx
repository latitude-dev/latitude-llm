import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentPropsWithRef } from "react"

import { font } from "../../tokens/font.ts"
import { cn } from "../../utils/cn.ts"
import { DotIndicator, type DotIndicatorProps } from "../dot-indicator/dot-indicator.tsx"
import { Icon, type IconProps } from "../icons/icons.tsx"

const badgeVariants = cva(
  "inline-flex items-center rounded-md font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-none bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-none bg-secondary text-secondary-foreground hover:bg-secondary/80",
        yellow: "border-none bg-yellow text-foreground hover:bg-yellow/80",
        purple: "border-none bg-purple text-purple-foreground hover:bg-purple/80",
        accent: "border-none bg-accent text-accent-foreground hover:bg-accent/80",
        success: "border-none bg-green-500 text-success-foreground hover:bg-green-500/80",
        successMuted: "border-none bg-success-muted text-success-muted-foreground hover:bg-success-muted/80",
        destructive: "border-none bg-destructive text-destructive-foreground hover:bg-destructive/80",
        destructiveMuted:
          "border-none bg-destructive-muted text-destructive-muted-foreground hover:bg-destructive-muted/80",
        warningMuted: "border-none bg-warning-muted text-warning-muted-foreground hover:bg-warning-muted/80",
        muted: "border-none bg-muted text-muted-foreground hover:bg-muted/80",
        outline: "border border-border text-foreground",
        outlineMuted: "border border-muted-foreground/30 text-muted-foreground",
        outlineAccent: "border border-accent-foreground/30 text-accent-foreground",
        outlinePurple: "border border-purple-foreground/30 text-purple-foreground",
        outlineSuccessMuted: "border border-success-muted-foreground/30 text-success-muted-foreground",
        outlineDestructiveMuted: "border border-destructive-muted-foreground/30 text-destructive-muted-foreground",
        outlineWarningMuted: "border border-warning-muted-foreground/30 text-warning-muted-foreground",
        noBorderMuted: "border-none bg-muted text-muted-foreground hover:bg-muted/80",
        noBorderDestructiveMuted:
          "border-none bg-destructive-muted text-destructive-muted-foreground hover:bg-destructive-muted/80",
        white: "border-none bg-white text-primary hover:bg-white/80",
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
      {iconProps && iconProps.placement === "start" ? <Icon {...iconProps} size="xs" /> : null}
      <span
        className={cn({
          truncate: ellipsis,
          "whitespace-nowrap": noWrap,
        })}
      >
        {children}
      </span>
      {iconProps && iconProps.placement === "end" ? <Icon {...iconProps} size="xs" /> : null}
    </div>
  )
}

export { Badge, badgeVariants }
