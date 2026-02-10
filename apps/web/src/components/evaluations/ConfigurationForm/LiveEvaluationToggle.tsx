import { EvaluationOptions } from '@latitude-data/core/constants'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'

export function LiveEvaluationToggle({
  options,
  setOptions,
  supportsLiveEvaluation,
  errors,
  disabled,
}: {
  options: Partial<EvaluationOptions>
  setOptions: (options: Partial<EvaluationOptions>) => void
  supportsLiveEvaluation: boolean
  errors?: Record<string, string[]>
  disabled?: boolean
}) {
  if (!supportsLiveEvaluation) return null

  return (
    <FormFieldGroup label='Options' layout='vertical'>
      <SwitchInput
        checked={!!options.evaluateLiveLogs}
        name='evaluateLiveLogs'
        label='Evaluate live logs'
        description='Evaluate production and playground logs automatically'
        onCheckedChange={(value) =>
          setOptions({ ...options, evaluateLiveLogs: value })
        }
        errors={errors?.evaluateLiveLogs}
        disabled={disabled || !supportsLiveEvaluation}
      />
    </FormFieldGroup>
  )
}
