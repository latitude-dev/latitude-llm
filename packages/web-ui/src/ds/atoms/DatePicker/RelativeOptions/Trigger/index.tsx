import { InputProps, InputVariants, useInputStyles } from '../../../Input'
import { SelectOption } from '../../../Select'
import { colors } from '../../../../tokens/colors'
import Text from '../../../Text'
import { cn } from '../../../../../lib/utils'
import { FormField, FormFieldProps } from '../../../FormField'

export type Props = Omit<FormFieldProps, 'children'> &
  InputVariants & {
    hideNativeAppearance?: boolean
    inputSize?: InputProps['size']
    selected: SelectOption | null | undefined
    placeholder?: string
    hidden?: boolean
  }

export function RelativeOptionsTrigger({
  selected,
  placeholder,
  inputSize,
  hideNativeAppearance,
  className,
  errors,
  label,
  hidden,
}: Props) {
  const styles = useInputStyles({
    size: inputSize,
    errors,
    hidden,
    className,
    hideNativeAppearance,
  })
  const text = selected?.label || placeholder || 'Select a relative option'
  return (
    <FormField label={label} errors={errors}>
      <div className={cn(styles, 'pr-8')}>
        <div
          className={cn(
            'truncate flex justify-start text-left',
            'w-full pointer-events-none',
            {
              [colors.textColors.foregroundMuted]: !selected,
            },
          )}
        >
          <Text.H5 ellipsis noWrap>
            {text}
          </Text.H5>
        </div>
      </div>
    </FormField>
  )
}
