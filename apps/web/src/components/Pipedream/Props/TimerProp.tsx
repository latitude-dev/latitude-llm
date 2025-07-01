import { IntegrationDto, PipedreamComponent } from '@latitude-data/core/browser'
import { CronInput } from '@latitude-data/web-ui/organisms/CronInput'
import { ConfigurablePropTimer } from '@pipedream/sdk/browser'

export default function PipedreamTimerProp({
  integration,
  prop,
  component,
  configuredProps,
  value,
  setValue,
}: {
  integration: IntegrationDto
  prop: ConfigurablePropTimer
  component: PipedreamComponent
  configuredProps: Record<string, unknown>
  value: any
  setValue: (value: any) => void
}) {
  return (
    <CronInput
      name={prop.name}
      required={!prop.optional}
      label={prop.label ?? prop.name}
      description={prop.description}
      // value={value}
      // onChange={(newVal) => setValue(newVal)}
      disabled={prop.disabled}
      fullWidth
    />
  )
}
