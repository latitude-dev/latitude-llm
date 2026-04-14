import { FormField } from "../form-field/form-field.tsx"
import { Checkbox, type CheckedState } from "./checkbox.tsx"

export interface CheckboxInputProps {
  checked?: CheckedState
  defaultChecked?: CheckedState
  onCheckedChange?: (checked: CheckedState) => void
  disabled?: boolean
  required?: boolean
  name?: string
  value?: string
  label?: string
  description?: string
  info?: string
  errors?: string[]
  className?: string
}

function CheckboxInput({
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  required,
  name,
  value,
  label,
  description,
  info,
  errors,
  className,
}: CheckboxInputProps) {
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
      <Checkbox
        name={name}
        disabled={disabled}
        required={required}
        checked={checked}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
        value={value}
        className="relative mt-1"
      />
    </FormField>
  )
}

export { CheckboxInput }
