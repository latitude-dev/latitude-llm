import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type { LucideProps } from "lucide-react"
import { type ButtonHTMLAttributes, type ComponentType, forwardRef, type ReactNode } from "react"

import { font } from "../../tokens/font.ts"
import { cn } from "../../utils/cn.ts"
import type { IconProps } from "../icons/icons.tsx"
import { Icon } from "../icons/icons.tsx"

const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-1 rounded-lg font-sans font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    font.size.h5,
  ),
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-primary text-primary-foreground [&_svg]:text-primary-foreground hover:bg-primary/90 disabled:cursor-default",
        primaryMuted:
          "border border-transparent bg-primary-muted text-accent-foreground [&_svg]:text-accent-foreground hover:bg-primary-muted-hover disabled:cursor-default",
        destructive:
          "border border-transparent bg-destructive text-destructive-foreground [&_svg]:text-destructive-foreground hover:bg-destructive/90 disabled:cursor-default",
        outline:
          "border border-input bg-background [&_svg]:text-secondary-foreground hover:bg-secondary hover:text-secondary-foreground/80 disabled:cursor-default",
        secondary:
          "border border-transparent bg-secondary text-secondary-foreground [&_svg]:text-secondary-foreground hover:bg-secondary/80 disabled:cursor-default",
        ghost:
          "border border-transparent bg-transparent text-muted-foreground [&_svg]:text-muted-foreground hover:bg-secondary disabled:cursor-default",
        link: "border-0 bg-transparent shadow-none text-accent-foreground [&_svg]:text-accent-foreground underline-offset-4 hover:underline disabled:cursor-default",
      },
      size: {
        default: "h-9 px-3 py-buttonDefaultVertical min-h-8",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
        full: "w-full h-9 px-3 py-buttonDefaultVertical min-h-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export type ButtonIconProps = {
  icon: ComponentType<LucideProps>
} & Omit<IconProps, "icon" | "color">

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  children?: ReactNode
  isLoading?: boolean
  /** Left or right icon; color follows variant via [&_svg] in Tailwind. */
  iconProps?: ButtonIconProps
  iconPosition?: "left" | "right"
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "default",
      size = "default",
      asChild = false,
      isLoading = false,
      children,
      iconProps,
      iconPosition = "left",
      disabled,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button"

    const content = (
      <>
        {isLoading && (
          <span
            className="shrink-0 size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden
          />
        )}
        {!isLoading && iconProps && iconPosition === "left" && (
          <Icon {...iconProps} className={cn("shrink-0", iconProps.className)} />
        )}
        {children != null && children !== "" ? <span className="max-w-full truncate">{children}</span> : null}
        {!isLoading && iconProps && iconPosition === "right" && (
          <Icon {...iconProps} className={cn("shrink-0", iconProps.className)} />
        )}
      </>
    )

    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }), { "animate-pulse": isLoading })}
        disabled={disabled ?? isLoading}
        aria-busy={isLoading ? "true" : undefined}
        {...props}
      >
        {content}
      </Comp>
    )
  },
)
Button.displayName = "Button"

/** @deprecated Use buttonVariants */
const buttonVariantsConfig = buttonVariants

export { Button, buttonVariants, buttonVariantsConfig }
