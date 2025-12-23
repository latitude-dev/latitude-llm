import {
  SimulationSettingsPanel,
  type SimulationSettingsProps,
} from '$/components/SimulationSettings'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'

export function SimulationSettingsSection({
  value,
  onChange,
  errors,
  disabled,
}: SimulationSettingsProps & {
  errors?: Record<string, string[]>
}) {
  return (
    <FormFieldGroup
      label='Simulation'
      layout='vertical'
      errors={errors?.['simulation']}
    >
      <SimulationSettingsPanel
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </FormFieldGroup>
  )
}
