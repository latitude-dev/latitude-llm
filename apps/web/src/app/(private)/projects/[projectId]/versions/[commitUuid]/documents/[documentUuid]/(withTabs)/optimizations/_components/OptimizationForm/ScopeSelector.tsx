import { OptimizationConfiguration } from '@latitude-data/constants'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import { useCallback } from 'react'

export function ScopeSelector({
  value,
  onChange,
  errors,
  disabled,
}: {
  value?: OptimizationConfiguration['scope']
  onChange: (value: OptimizationConfiguration['scope']) => void
  errors?: Record<string, string[]>
  disabled?: boolean
}) {
  const handleInstructionsChange = useCallback(
    (checked: boolean) => {
      onChange({ ...value, instructions: checked })
    },
    [value, onChange],
  )

  const handleConfigurationChange = useCallback(
    (checked: boolean) => {
      onChange({ ...value, configuration: checked })
    },
    [value, onChange],
  )

  return (
    <FormFieldGroup
      label='Scope'
      description='Which parts of the prompt, instructions and/or configuration (temperature, top_p, top_k...), should be optimized. The provider and model will be preserved from the original prompt'
      layout='horizontal'
      errors={errors?.['scope']}
    >
      <SwitchInput
        checked={value?.instructions ?? false}
        onCheckedChange={handleInstructionsChange}
        label='Instructions'
        disabled={disabled}
      />
      <SwitchInput
        checked={value?.configuration ?? false}
        onCheckedChange={handleConfigurationChange}
        label='Configuration'
        disabled={disabled}
      />
    </FormFieldGroup>
  )
}
