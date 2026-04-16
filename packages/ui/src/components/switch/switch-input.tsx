import { FormField } from "../form-field/form-field.tsx"
import { Switch } from "./switch.tsx"

function definedProps(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined) result[k] = v
  }
  return result
}

export interface SwitchInputProps {
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
  disabled?: boolean
  loading?: boolean
  required?: boolean
  name?: string
  value?: string
  id?: string
  label?: string
  description?: string
  info?: string
  errors?: string[]
  className?: string
}

function SwitchInput({
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  loading,
  required,
  name,
  value,
  id,
  label,
  description,
  info,
  errors,
  className,
}: SwitchInputProps) {
  return (
    <FormField
      inline
      childrenFirst
      label={label}
      info={info}
      description={description}
      errors={errors}
      className={className}
    >
      <Switch
        className="relative mt-1"
        {...definedProps({
          id,
          name,
          value,
          checked,
          defaultChecked,
          onCheckedChange,
          disabled,
          loading,
          required,
        })}
      />
    </FormField>
  )
}

export { SwitchInput }
