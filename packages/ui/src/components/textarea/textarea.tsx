import type { ReactNode, Ref, TextareaHTMLAttributes } from "react"
import TextareaAutosize from "react-textarea-autosize"

import { font } from "../../tokens/font.ts"
import { cn } from "../../utils/cn.ts"
import { FormField } from "../form-field/form-field.tsx"

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className" | "style"> {
  ref?: Ref<HTMLTextAreaElement>
  label?: ReactNode
  description?: ReactNode
  info?: string | undefined
  errors?: string[] | undefined
  inline?: boolean | undefined
  className?: string
  minRows?: number
  maxRows?: number
  unstyled?: boolean
}

export function Textarea({
  ref,
  className,
  label,
  description,
  info,
  errors,
  inline,
  minRows = 2,
  maxRows,
  unstyled = false,
  ...props
}: TextareaProps) {
  return (
    <FormField label={label} description={description} info={info} errors={errors} inline={inline}>
      <TextareaAutosize
        ref={ref}
        minRows={minRows}
        {...(maxRows !== undefined ? { maxRows } : {})}
        className={cn(
          font.size.h5,
          "w-full resize-none bg-transparent outline-none",
          "placeholder:text-muted-foreground",
          !unstyled && [
            "rounded-md border border-input px-3 py-2 transition-colors",
            "focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-50",
            errors && errors.length > 0 && "border-destructive",
          ],
          className,
        )}
        {...props}
      />
    </FormField>
  )
}
