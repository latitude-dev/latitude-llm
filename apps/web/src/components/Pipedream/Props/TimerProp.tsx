import type { IntegrationDto, PipedreamComponent } from '@latitude-data/core/browser'
import { CronInput } from '@latitude-data/web-ui/organisms/CronInput'
import type { ConfigurablePropTimer, TimerCron } from '@pipedream/sdk/browser'

export default function PipedreamTimerProp({
  prop,
  value,
  setValue,
  disabled,
}: {
  integration: IntegrationDto
  prop: ConfigurablePropTimer
  component: PipedreamComponent
  configuredProps: Record<string, unknown>
  value: TimerCron | undefined
  setValue: (value: TimerCron | undefined) => void
  disabled?: boolean
}) {
  return (
    <CronInput
      name={prop.name}
      required={!prop.optional}
      label={prop.label ?? prop.name}
      description={prop.description}
      value={value?.cron}
      onChange={(newVal) => setValue({ cron: newVal })}
      disabled={disabled || prop.disabled}
      fullWidth
    />
  )
}
