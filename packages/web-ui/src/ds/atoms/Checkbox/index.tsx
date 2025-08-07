import { FormField } from '../FormField'
import { FormFieldProps } from '../FormField'
import { CheckboxAtom, CheckedState, type CheckboxAtomProps } from './Primitive'

export type CheckboxProps = CheckboxAtomProps & Omit<FormFieldProps, 'children'>
export function Checkbox({
  label,
  info,
  description,
  errors,
  errorStyle,
  fullWidth,
  ...props
}: CheckboxProps) {
  return (
    <FormField
      inline
      label={label}
      info={info}
      description={description}
      errors={errors}
      errorStyle={errorStyle}
      fullWidth={fullWidth}
    >
      <CheckboxAtom {...props} />
    </FormField>
  )
}

export { type CheckedState }
