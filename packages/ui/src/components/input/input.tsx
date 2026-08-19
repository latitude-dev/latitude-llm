import { cva, type VariantProps } from "class-variance-authority"
import { forwardRef, type InputHTMLAttributes, useId } from "react"

import { font } from "../../tokens/font.ts"
import { cn } from "../../utils/cn.ts"
import { FormField } from "../form-field/form-field.tsx"
import { Text } from "../text/text.tsx"

const inputVariants = cva(
  cn(
    "flex w-full rounded-md border border-input px-3 py-1 text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
    font.size.h5,
  ),
  {
    variants: {
      variant: {
        default: "",
        floating: "",
      },
      size: {
        default: "",
        sm: "",
        lg: "",
      },
      background: {
        transparent: "bg-transparent",
        background: "bg-background",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      background: "transparent",
    },
    compoundVariants: [
      {
        variant: "default",
        size: "default",
        className: "h-8",
      },
      {
        variant: "default",
        size: "sm",
        className: "h-8 px-2",
      },
      {
        variant: "default",
        size: "lg",
        className: "h-10 px-4",
      },
      {
        variant: "floating",
        size: "default",
        className: "h-8 px-3 py-1",
      },
      {
        variant: "floating",
        size: "sm",
        className: "h-8 px-2 py-1",
      },
      {
        variant: "floating",
        size: "lg",
        className: "h-10 px-4 py-2",
      },
    ],
  },
)

import type { ReactNode } from "react"

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "className">,
    VariantProps<typeof inputVariants> {
  label?: ReactNode
  description?: ReactNode
  info?: string | undefined
  errors?: string[] | undefined
  inline?: boolean | undefined
  className?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, description, info, errors, inline, size, background, variant, type, id, ...props }, ref) => {
    const generatedId = useId()
    const inputId = id ?? generatedId
    const hasError = Boolean(errors && errors.length > 0)
    const useFloatingLabel = variant === "floating" && !inline && Boolean(label)

    const input = (
      <input
        id={inputId}
        type={type}
        className={cn(
          inputVariants({ size, background, variant, className }),
          hasError && "border-destructive focus-visible:ring-destructive/30",
          useFloatingLabel && "peer placeholder:text-transparent",
        )}
        ref={ref}
        placeholder={useFloatingLabel ? " " : props.placeholder}
        {...props}
      />
    )

    if (useFloatingLabel) {
      return (
        <div className="flex flex-col gap-1">
          <div className="relative">
            {input}
            <label
              htmlFor={inputId}
              className={cn(
                "pointer-events-none absolute left-2 z-1 inline-flex max-w-[calc(100%-1rem)] bg-background px-1 text-muted-foreground transition-all duration-150 ease-out",
                "top-1/2 -translate-y-1/2 text-sm",
                "peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-[10px] peer-focus:font-medium",
                "peer-[&:not(:placeholder-shown)]:top-0 peer-[&:not(:placeholder-shown)]:-translate-y-1/2 peer-[&:not(:placeholder-shown)]:text-[10px] peer-[&:not(:placeholder-shown)]:font-medium",
                hasError && "text-destructive peer-focus:text-destructive peer-[&:not(:placeholder-shown)]:text-destructive",
              )}
            >
              {label}
            </label>
          </div>
          {description ? (
            <Text.H6 className="px-1" color="foregroundMuted">
              {description}
            </Text.H6>
          ) : null}
          {info ? (
            <Text.H6 className="px-1" color="foregroundMuted">
              {info}
            </Text.H6>
          ) : null}
          {hasError ? (
            <div role="alert" className="flex flex-col gap-1 px-1">
              {errors?.map((error) => (
                <Text.H6 key={error} color="destructive">
                  {error}
                </Text.H6>
              ))}
            </div>
          ) : null}
        </div>
      )
    }

    if (label || description || errors) {
      return (
        <FormField label={label} htmlFor={inputId} description={description} info={info} errors={errors} inline={inline}>
          {input}
        </FormField>
      )
    }

    return input
  },
)
Input.displayName = "Input"

export { Input }
