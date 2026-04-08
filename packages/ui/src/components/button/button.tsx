import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { type ButtonHTMLAttributes, forwardRef } from "react"

import { font } from "../../tokens/font.ts"
import { cn } from "../../utils/cn.ts"

const outerElevation = "border-0 shadow-sm transition-shadow duration-200 hover:shadow-lg"

const insetFaceHighlight =
  "shadow-[var(--button-face-inset-shadow)] group-hover:shadow-[var(--button-face-inset-shadow-hover)]"

const buttonContainerVariants = cva(
  cn(
    "group relative inline-flex rounded-lg transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50",
    outerElevation,
  ),
  {
    variants: {
      variant: {
        default: "bg-transparent",
        destructive: "bg-destructive-muted-foreground hover:bg-destructive-muted-foreground/90",
        outline: "bg-secondary shadow-none hover:bg-secondary/60 hover:shadow-none",
        secondary: "bg-secondary hover:bg-secondary/80",
        ghost: "bg-transparent shadow-none hover:shadow-none",
        link: "bg-transparent shadow-none underline-offset-4 hover:underline hover:shadow-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

const buttonVariantsConfig = cva(
  cn(
    "inline-flex w-full max-w-full cursor-pointer items-center justify-center rounded-lg font-sans font-medium transition-[color,background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background group-disabled:pointer-events-none group-disabled:opacity-50",
    font.size.h5,
  ),
  {
    variants: {
      variant: {
        default: cn(
          "border-0 bg-primary text-primary-foreground group-hover:bg-primary/90 disabled:cursor-default",
          insetFaceHighlight,
        ),
        destructive: cn(
          "border-0 bg-destructive text-destructive-foreground group-hover:bg-destructive/90",
          insetFaceHighlight,
        ),
        outline:
          "border border-input bg-background shadow-none group-hover:bg-secondary group-hover:text-secondary-foreground/80 group-hover:shadow-none",
        secondary: cn(
          "border-0 bg-secondary text-secondary-foreground group-hover:bg-secondary/90",
          insetFaceHighlight,
        ),
        ghost:
          "border-0 border-transparent bg-transparent text-muted-foreground shadow-none hover:bg-muted hover:shadow-none",
        link: "border-0 bg-transparent text-accent-foreground shadow-none underline-offset-4 group-hover:underline group-hover:shadow-none",
      },
      size: {
        default: "min-h-8 px-3 py-buttonDefaultVertical",
        sm: "h-7 rounded-lg px-2 text-xs",
        lg: "h-10 rounded-lg px-8",
        icon: "h-8 w-8 p-0",
        full: "min-h-8 w-full px-3 py-buttonDefaultVertical",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariantsConfig> {
  asChild?: boolean
  isLoading?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading = false, children, disabled, ...props }, ref) => {
    const effectiveVariant = variant ?? "default"

    if (asChild) {
      return (
        <Slot
          ref={ref}
          className={cn(
            buttonContainerVariants({ variant }),
            buttonVariantsConfig({ variant, size }),
            className,
            isLoading && "animate-pulse",
          )}
          {...props}
        >
          {children}
        </Slot>
      )
    }

    return (
      <button
        ref={ref}
        {...props}
        className={cn(buttonContainerVariants({ variant }), isLoading && "animate-pulse")}
        disabled={disabled || isLoading}
        aria-busy={isLoading ? "true" : undefined}
      >
        {effectiveVariant !== "outline" && effectiveVariant !== "ghost" && effectiveVariant !== "link" && (
          <div
            className={cn(
              "pointer-events-none absolute -inset-1 z-0 scale-95 rounded-xl opacity-0 transition-all duration-200 ease-out group-hover:scale-100 group-hover:opacity-100 group-active:-inset-0.5",
              effectiveVariant === "destructive"
                ? "bg-destructive/30"
                : effectiveVariant === "default"
                  ? "bg-primary/20"
                  : "bg-foreground/10",
            )}
            aria-hidden
          />
        )}
        <div className={cn(buttonVariantsConfig({ variant, size }), "relative z-[1]", className)}>
          <div className="flex max-w-full flex-row items-center gap-x-1.5">
            {isLoading && (
              <span
                className={cn(
                  "shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
                  size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4",
                )}
              />
            )}
            {children}
          </div>
        </div>
      </button>
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariantsConfig }
