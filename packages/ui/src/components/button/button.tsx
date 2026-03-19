import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { type ButtonHTMLAttributes, forwardRef } from "react"

import { font } from "../../tokens/font.ts"
import { boxShadow } from "../../tokens/shadow.ts"
import { cn } from "../../utils/cn.ts"

const buttonContainerVariants = cva(
  cn("group relative inline-flex rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:pointer-events-none"),
  {
    variants: {
      variant: {
        default: "bg-transparent",
        destructive: "bg-destructive-muted-foreground hover:bg-destructive-muted-foreground/90",
        outline: "bg-secondary hover:bg-secondary/60",
        secondary: "bg-secondary hover:bg-secondary/80",
        ghost: "shadow-none bg-transparent",
        link: "bg-transparent shadow-none underline-offset-4 hover:underline",
      },
      fanciness: {
        default: "bg-transparent hover:bg-transparent",
        fancy: `border-0 transition-shadow duration-200 ${boxShadow.sm} hover:${boxShadow.lg}`,
      },
    },
    compoundVariants: [
      {
        variant: "outline",
        fanciness: "fancy",
        className: "shadow-none hover:shadow-none",
      },
      {
        variant: "ghost",
        fanciness: "fancy",
        className: "shadow-none hover:shadow-none",
      },
      {
        variant: "link",
        fanciness: "fancy",
        className: "shadow-none hover:shadow-none",
      },
    ],
    defaultVariants: {
      variant: "default",
      fanciness: "fancy",
    },
  },
)

const buttonVariantsConfig = cva(
  cn(
    "w-full cursor-pointer inline-flex items-center justify-center rounded-lg font-sans font-medium transition-[color,background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background group-disabled:opacity-50 group-disabled:pointer-events-none",
    font.size.h5,
  ),
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-primary text-primary-foreground group-hover:bg-primary/90 disabled:cursor-default",
        destructive: "bg-destructive text-destructive-foreground group-hover:bg-destructive/90",
        outline: "border border-input bg-background group-hover:bg-secondary group-hover:text-secondary-foreground/80",
        secondary: "border border-transparent bg-secondary text-secondary-foreground group-hover:bg-secondary/80",
        ghost: "border-0 border-transparent shadow-none bg-transparent text-muted-foreground group-hover:bg-muted",
        link: "border-0 shadow-none underline-offset-4 group-hover:underline text-accent-foreground bg-transparent",
      },
      size: {
        default: "py-buttonDefaultVertical px-3 min-h-8",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-10 rounded-lg px-8",
        icon: "h-9 w-9",
        full: "w-full py-buttonDefaultVertical px-3 min-h-8",
      },
      fanciness: {
        default: "",
        fancy:
          "border-0 transition-[color,background-color,border-color,box-shadow] duration-200 shadow-[inset_0px_3px_8px_0px_rgba(255,255,255,0.48)] group-hover:shadow-[inset_0px_3px_8px_0px_rgba(255,255,255,0)]",
      },
    },
    compoundVariants: [
      {
        variant: "outline",
        fanciness: "fancy",
        className: "border border-input shadow-none group-hover:shadow-none",
      },
      {
        variant: "destructive",
        fanciness: "fancy",
        className: "border-0",
      },
      {
        variant: "ghost",
        fanciness: "fancy",
        className: "border-0 shadow-none group-hover:shadow-none",
      },
      {
        variant: "link",
        fanciness: "fancy",
        className: "shadow-none group-hover:shadow-none",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      fanciness: "fancy",
    },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariantsConfig> {
  asChild?: boolean
  isLoading?: boolean
  flat?: boolean
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, isLoading = false, flat = false, children, disabled, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button"
    const fanciness = flat ? "default" : "fancy"
    const effectiveVariant = variant ?? "default"

    return (
      <Comp
        className={cn(buttonContainerVariants({ variant, fanciness }), {
          "animate-pulse": isLoading,
        })}
        ref={ref}
        disabled={disabled || isLoading}
        aria-busy={isLoading ? "true" : undefined}
        {...props}
      >
        {fanciness === "fancy" &&
          effectiveVariant !== "outline" &&
          effectiveVariant !== "ghost" &&
          effectiveVariant !== "link" && (
            <div
              className={cn(
                "pointer-events-none absolute -inset-1 rounded-xl border-2 border-dashed opacity-0 scale-95 transition-all duration-200 group-hover:opacity-100 group-hover:scale-100 group-active:-inset-2",
                effectiveVariant === "destructive"
                  ? "border-destructive"
                  : effectiveVariant === "default"
                    ? "border-primary"
                    : "border-border",
              )}
              aria-hidden
            />
          )}
        <div
          className={cn(buttonVariantsConfig({ variant, size, className, fanciness }), {
            "animate-pulse": isLoading,
          })}
        >
          <div className="flex flex-row items-center gap-x-1.5 max-w-full">
            {isLoading && (
              <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {children}
          </div>
        </div>
      </Comp>
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariantsConfig }
