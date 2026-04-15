import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { type ButtonHTMLAttributes, Children, forwardRef, isValidElement, type ReactNode } from "react"

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
        "default-soft": "bg-transparent shadow-none hover:shadow-none",
        "destructive-soft": "bg-transparent shadow-none hover:shadow-none",
        "secondary-soft": "bg-transparent shadow-none hover:shadow-none",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

const glowBeforeBase = [
  "before:pointer-events-none",
  "before:absolute",
  "before:-inset-1",
  "before:z-0",
  "before:scale-95",
  "before:rounded-xl",
  "before:opacity-0",
  "before:transition-all",
  "before:duration-200",
  "before:ease-out",
  "before:content-['']",
  "group-hover:before:scale-100",
  "group-hover:before:opacity-100",
  "group-active:before:-inset-0.5",
] as const

const buttonVariantsConfig = cva(
  cn(
    "relative inline-flex w-full max-w-full cursor-pointer items-center justify-center rounded-lg font-sans font-medium transition-[color,background-color,border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background group-disabled:pointer-events-none group-disabled:opacity-50",
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
          "border-0 bg-secondary text-secondary-foreground [&_svg]:text-muted-foreground group-hover:bg-secondary/90",
          insetFaceHighlight,
        ),
        ghost:
          "border-0 border-transparent bg-transparent text-muted-foreground shadow-none group-hover:bg-muted group-hover:shadow-none",
        link: "border-0 bg-transparent text-accent-foreground shadow-none underline-offset-4 group-hover:underline group-hover:shadow-none",
        "default-soft":
          "border-0 bg-primary-muted text-primary shadow-none group-hover:bg-primary-muted-hover group-hover:shadow-none group-active:bg-primary-muted group-hover:group-active:bg-primary-muted [&_svg]:text-primary/70",
        "destructive-soft":
          "border-0 bg-destructive-muted text-destructive-muted-foreground shadow-none group-hover:bg-destructive-muted-hover group-hover:shadow-none group-active:bg-destructive-muted group-hover:group-active:bg-destructive-muted [&_svg]:text-destructive-muted-foreground/85",
        "secondary-soft":
          "border-0 bg-secondary-muted text-secondary-foreground shadow-none group-hover:bg-secondary-muted-hover group-hover:shadow-none group-active:bg-secondary-muted group-hover:group-active:bg-secondary-muted [&_svg]:text-muted-foreground",
      },
      size: {
        default: "min-h-8 px-3 py-buttonDefaultVertical",
        sm: "h-7 rounded-lg px-2 text-xs",
        lg: "h-10 rounded-lg px-8",
        icon: "h-8 w-8 p-0",
        "icon-xs": "h-5 w-5 p-0 rounded-md",
        full: "min-h-8 w-full px-3 py-buttonDefaultVertical",
      },
    },
    compoundVariants: [
      {
        variant: ["default", "destructive", "secondary"],
        class: [...glowBeforeBase],
      },
      { variant: "default", class: "before:bg-primary/20" },
      { variant: "destructive", class: "before:bg-destructive/30" },
      { variant: "secondary", class: "before:bg-foreground/10" },
    ],
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

function getElementDisplayName(type: unknown): string {
  if (typeof type === "string") {
    return type
  }

  if (typeof type === "function") {
    const componentType = type as { displayName?: string; name?: string }
    return componentType.displayName ?? componentType.name ?? ""
  }

  if (typeof type === "object" && type !== null) {
    return "displayName" in type && typeof type.displayName === "string"
      ? type.displayName
      : "name" in type && typeof type.name === "string"
        ? type.name
        : ""
  }

  return ""
}

function isLeadingIconLikeChild(child: unknown): boolean {
  if (!isValidElement(child)) {
    return false
  }

  const displayName = getElementDisplayName(child.type)
  return displayName === "svg" || displayName === "Icon" || displayName.endsWith("Icon")
}

function stripLeadingIconChild(children: ReactNode): ReactNode {
  const childArray = Children.toArray(children)
  const firstMeaningfulChildIndex = childArray.findIndex(
    (child) => !(typeof child === "string" && child.trim().length === 0),
  )

  if (firstMeaningfulChildIndex < 0 || !isLeadingIconLikeChild(childArray[firstMeaningfulChildIndex])) {
    return childArray
  }

  return childArray.filter((_, index) => index !== firstMeaningfulChildIndex)
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, isLoading = false, children, disabled, ...props }, ref) => {
    const visibleChildren = isLoading ? stripLeadingIconChild(children) : children

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
          {visibleChildren}
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
        <div className={cn(buttonVariantsConfig({ variant, size }), "z-[1]", className)}>
          <div className="relative z-[1] flex max-w-full flex-row items-center gap-x-1.5">
            {isLoading && (
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            {visibleChildren}
          </div>
        </div>
      </button>
    )
  },
)
Button.displayName = "Button"

export { Button, buttonVariantsConfig }
