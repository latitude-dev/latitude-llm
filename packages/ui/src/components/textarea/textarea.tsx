import type { ReactNode, TextareaHTMLAttributes } from "react"

import { font } from "../../tokens/font.ts"
import { cn } from "../../utils/cn.ts"
import { FormField } from "../form-field/form-field.tsx"

const textareaBaseClass = cn(
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm transition-colors",
  "placeholder:text-muted-foreground",
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "resize-none",
  font.size.h5,
)

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className"> {
  label?: ReactNode
  description?: ReactNode
  info?: string | undefined
  errors?: string[] | undefined
  inline?: boolean | undefined
  className?: string
}

export function Textarea({ className, label, description, info, errors, inline, ...props }: TextareaProps) {
  return (
    <FormField label={label} description={description} info={info} errors={errors} inline={inline}>
      <textarea
        className={cn(textareaBaseClass, errors && errors.length > 0 && "border-destructive", className)}
        {...props}
      />
    </FormField>
  )
}
