import { usePipedreamComponentProps } from '$/hooks/pipedreamProps/usePipedreamComponentProps'
import {
  IntegrationDto,
  PipedreamComponent,
  PipedreamComponentType,
} from '@latitude-data/core/browser'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { cn } from '@latitude-data/web-ui/utils'
import {
  ConfigurableProp,
  ConfigurablePropBoolean,
  ConfigurableProps,
  ConfiguredProps,
} from '@pipedream/sdk/browser'
import DynamicPipedreamProp, { isDynamicProp } from './Props/DynamicProp'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { Alert } from '@latitude-data/web-ui/atoms/Alert'
import { AlertProps } from '@latitude-data/web-ui/atoms/Alert/Primitives'
import PipedreamTimerProp from './Props/TimerProp'
import ArrayPipedreamProp from './Props/ArrayProp'

type Defined<T> = Exclude<T, undefined | null>
type AlertType = Defined<
  Extract<ConfigurableProp, { type: 'alert' }>['alertType']
>
type AlertVariant = Defined<AlertProps['variant']>
const ALERT_VARIANTS: Record<AlertType, AlertVariant> = {
  info: 'default',
  neutral: 'default',
  warning: 'warning',
  error: 'destructive',
}

export function PipedreamComponentPropsForm<T extends PipedreamComponentType>({
  integration,
  component,
  values: defaultValues,
  onChange,
  disabled = false,
}: {
  integration: IntegrationDto
  component: PipedreamComponent<T>
  values: ConfiguredProps<ConfigurableProps>
  onChange?: (values: ConfiguredProps<ConfigurableProps>) => void
  disabled?: boolean
}) {
  const { props, values, setValue, isLoading } = usePipedreamComponentProps({
    integration,
    component,
    defaultValues,
    onChange,
  })

  return (
    <div
      className={cn('flex flex-col gap-6 w-full', {
        'animate-pulse': isLoading,
      })}
    >
      {props.map((prop, index) => (
        <PipedreamPropsForm
          key={index}
          integration={integration}
          component={component}
          prop={prop}
          configuredProps={values}
          value={values[prop.name]}
          setValue={(value) => setValue(prop.name, value)}
          disabled={disabled}
        />
      ))}
    </div>
  )
}

function UnknownPipedreamProp({
  prop,
}: {
  prop: ConfigurableProp
  value?: any
  setValue?: (value: any) => void
  disabled?: boolean
}) {
  return (
    <div className='flex flex-col gap-1 w-full'>
      <Text.H6>{prop.label ?? prop.name}</Text.H6>
      {prop.description && (
        <Text.H6 color='foregroundMuted'>{prop.description}</Text.H6>
      )}
      <Text.H6 whiteSpace='preWrap'>{JSON.stringify(prop, null, 2)}</Text.H6>
    </div>
  )
}

function BooleanPipedreamProp({
  prop,
  value,
  setValue,
  disabled,
}: {
  prop: ConfigurablePropBoolean
  value: boolean
  setValue: (value: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className='flex flex-col gap-1 w-full'>
      <div className='flex items-center gap-2 justify-between'>
        <Text.H5M>{prop.label ?? prop.name}</Text.H5M>
        <SwitchToggle
          name={prop.name}
          required={!prop.optional}
          disabled={disabled || prop.disabled}
          checked={value}
          onCheckedChange={setValue}
        />
      </div>
      {prop.description && (
        <Text.H6 color='foregroundMuted'>{prop.description}</Text.H6>
      )}
    </div>
  )
}

function PipedreamPropsForm({
  integration,
  prop,
  component,
  configuredProps,
  value,
  setValue,
  disabled,
}: {
  integration: IntegrationDto
  prop: ConfigurableProp
  component: PipedreamComponent
  configuredProps: Record<string, unknown>
  value: any
  setValue: (value: any) => void
  disabled?: boolean
}) {
  if (prop.hidden) return null

  if (isDynamicProp(prop)) {
    return (
      <DynamicPipedreamProp
        integration={integration}
        prop={prop}
        component={component}
        configuredProps={configuredProps}
        value={value}
        setValue={setValue}
        disabled={disabled}
      />
    )
  }

  if (prop.type === 'boolean') {
    return (
      <BooleanPipedreamProp
        prop={prop}
        value={value}
        setValue={setValue}
        disabled={disabled}
      />
    )
  }

  if (prop.type === 'string' || prop.type === 'integer') {
    return (
      <Input
        name={prop.name}
        label={prop.label ?? prop.name}
        required={!prop.optional}
        value={value ?? ''}
        onChange={(e) => setValue(e.target.value)}
        description={prop.description}
        type={prop.type === 'string' ? 'text' : 'number'}
        disabled={disabled || prop.disabled}
        min={prop.type === 'integer' ? prop.min : undefined}
        max={prop.type === 'integer' ? prop.max : undefined}
      />
    )
  }

  if (prop.type === 'string[]' || prop.type === 'integer[]') {
    return (
      <ArrayPipedreamProp
        prop={prop}
        type={prop.type === 'string[]' ? 'text' : 'number'}
        value={value}
        setValue={setValue}
        disabled={disabled}
      />
    )
  }

  if (prop.type === 'alert') {
    return (
      <Alert
        variant={ALERT_VARIANTS[prop.alertType ?? 'info']}
        description={prop.content}
      />
    )
  }

  if (prop.type === '$.interface.timer') {
    return (
      <PipedreamTimerProp
        integration={integration}
        prop={prop}
        component={component}
        configuredProps={configuredProps}
        value={value}
        setValue={setValue}
        disabled={disabled}
      />
    )
  }

  return (
    <UnknownPipedreamProp
      prop={prop}
      value={value}
      setValue={setValue}
      disabled={disabled}
    />
  )
}
