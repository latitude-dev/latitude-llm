import { type ReactNode, useId } from "react"

import { cn } from "../../utils/cn.ts"
import { Label } from "../label/label.tsx"
import { Text } from "../text/text.tsx"

export interface FormFieldProps {
  children: ReactNode
  label?: ReactNode
  description?: ReactNode
  info?: string | undefined
  inline?: boolean | undefined
  errors?: string[] | undefined
  className?: string | undefined
  /** When true with inline, renders children before label (useful for checkboxes) */
  childrenFirst?: boolean | undefined
}

function FormField({
  children,
  label,
  description,
  info,
  inline = false,
  errors,
  className,
  childrenFirst = false,
}: FormFieldProps) {
  const hasError = errors && errors.length > 0
  const id = useId()
  const errorId = `${id}-error`
  const descriptionId = `${id}-description`

  const errorBlock = hasError && (
    <div id={errorId} role="alert" className="flex flex-col gap-1">
      {errors.map((error) => (
        <Text.H6 key={error} color="destructive">
          {error}
        </Text.H6>
      ))}
    </div>
  )

  if (inline && childrenFirst) {
    return (
      <div className={cn("flex flex-col gap-1", className)}>
        {/* biome-ignore lint/a11y/noLabelWithoutControl: children contains the form control */}
        <label className="flex cursor-pointer items-start gap-3">
          {children}
          {(label || description) && (
            <span className="flex flex-col gap-0.5">
              {label && (
                <span className="flex items-center gap-2">
                  <Text.H5>{label}</Text.H5>
                  {info && <Text.H6 color="foregroundMuted">{info}</Text.H6>}
                </span>
              )}
              {description && (
                <Text.H6 id={descriptionId} color="foregroundMuted">
                  {description}
                </Text.H6>
              )}
            </span>
          )}
        </label>
        {errorBlock}
      </div>
    )
  }

  const labelBlock = label && (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Label htmlFor={id}>{label}</Label>
        {info && <Text.H6 color="foregroundMuted">{info}</Text.H6>}
      </div>
    </div>
  )

  const childrenBlock = (
    <div className={cn("flex min-w-0 flex-1 flex-col gap-1")}>
      {children}
      {description && (
        <Text.H6 id={descriptionId} color="foregroundMuted">
          {description}
        </Text.H6>
      )}
      {errorBlock}
    </div>
  )

  return (
    <div className={cn("flex gap-2", inline ? "flex-row items-center" : "flex-col", className)}>
      {labelBlock}
      {childrenBlock}
    </div>
  )
}

export { FormField }
