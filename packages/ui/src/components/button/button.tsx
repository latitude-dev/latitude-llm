import { Slot } from "@radix-ui/react-slot"
import { type VariantProps, cva } from "class-variance-authority"
import { type ButtonHTMLAttributes, forwardRef } from "react"

import { font } from "../../tokens/index.js"
import { cn } from "../../utils/cn.js"

const buttonContainerVariants = cva(
  cn("group relative inline-flex rounded-lg disabled:opacity-50 disabled:pointer-events-none"),
  {
    variants: {
      variant: {
        default: "bg-accent-button hover:bg-accent-foreground/90",
        destructive: "bg-destructive-muted-foreground hover:bg-destructive-muted-foreground/90",
        outline: "bg-secondary hover:bg-secondary/60",
        secondary: "bg-secondary hover:bg-secondary/80",
        ghost: "shadow-none bg-transparent",
        link: "bg-transparent shadow-none underline-offset-4 hover:underline",
      },
      fanciness: {
        default: "bg-transparent hover:bg-transparent",
        fancy: "border-0 pb-1 active:pb-0 active:mt-1 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.4)]",
      },
    },
    compoundVariants: [
      {
        variant: "outline",
        fanciness: "fancy",
        className: "shadow-[inset_0px_0px_0px_1px_hsl(var(--input))]",
      },
      {
        variant: "destructive",
        fanciness: "fancy",
        className:
          "shadow-[inset_0px_0px_0px_1px_hsl(var(--destructive)_/_0.5)] dark:shadow-[inset_0px_0px_0px_1px_hsl(var(--foreground))]",
      },
    ],
    defaultVariants: {
      variant: "default",
      fanciness: "fancy",
    },
  },
)

const buttonVariants = cva(
  cn(
    "w-full inline-flex items-center justify-center rounded-lg font-sans font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background group-disabled:opacity-50 group-disabled:pointer-events-none",
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
        ghost: "border border-transparent shadow-none bg-transparent text-muted-foreground",
        link: "shadow-none underline-offset-4 group-hover:underline text-accent-foreground",
      },
      size: {
        default: "py-buttonDefaultVertical px-3 min-h-8",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9",
        full: "w-full py-buttonDefaultVertical px-3 min-h-8",
      },
      fanciness: {
        default: "",
        fancy: "border-0 shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.4)]",
      },
    },
    compoundVariants: [
      {
        variant: "outline",
        fanciness: "fancy",
        className: "shadow-[inset_0px_0px_0px_1px_hsl(var(--input))]",
      },
      {
        variant: "destructive",
        fanciness: "fancy",
        className:
          "shadow-[inset_0px_0px_0px_1px_hsl(var(--destructive)_/_0.5)] dark:shadow-[inset_0px_0px_0px_1px_hsl(var(--foreground))]",
      },
      {
        fanciness: "fancy",
        className: "py-0.5",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
      fanciness: "fancy",
    },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
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
        <div
          className={cn(buttonVariants({ variant, size, className, fanciness }), {
            "animate-pulse": isLoading,
          })}
        >
          <div className="flex flex-row items-center gap-x-1.5 cursor-pointer max-w-full">
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

export { Button, buttonVariants }
