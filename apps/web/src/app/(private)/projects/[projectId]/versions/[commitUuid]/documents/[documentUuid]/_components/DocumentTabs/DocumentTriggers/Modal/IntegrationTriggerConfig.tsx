import { PipedreamComponentPropsForm } from '$/components/Pipedream/PipedreamPropsForm'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { useCurrentCommit } from '$/app/providers/CommitProvider'
import { ConfigurableProps, ConfiguredProps } from '@pipedream/sdk/browser'
import {
  DocumentVersion,
  IntegrationDto,
} from '@latitude-data/core/schema/types'
import {
  PipedreamComponent,
  PipedreamComponentType,
} from '@latitude-data/core/constants'

function ParameterSelects({
  document,
  payloadParameters,
  setPayloadParameters,
  disabled,
}: {
  document: DocumentVersion
  payloadParameters: string[]
  setPayloadParameters: ReactStateDispatch<string[]>
  disabled: boolean
}) {
  const { commit } = useCurrentCommit()

  const {
    manual: { inputs },
  } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
  })
  const parameterNames = Object.keys(inputs)

  return (
    <div className='flex flex-col gap-2'>
      <Text.H5M>Prompt Parameters</Text.H5M>
      <Text.H6 color='foregroundMuted'>
        Select the data to use for each parameter when a trigger event occurs.
      </Text.H6>
      {parameterNames.length === 0 && (
        <Text.H6 color='foregroundMuted' isItalic>
          This prompt has no parameters.
        </Text.H6>
      )}
      {parameterNames.map((paramName) => {
        const value = payloadParameters.includes(paramName)
          ? 'payload'
          : undefined
        return (
          <div className='flex gap-2 items-center' key={paramName}>
            <Badge
              variant={value ? 'accent' : 'muted'}
              noWrap
              ellipsis
              className='min-w-24'
            >
              {`{{${paramName}}}`}
            </Badge>
            <Select
              name={paramName}
              options={[{ value: 'payload', label: 'Payload' }]}
              info='Test info text'
              disabled={disabled}
              value={value}
              onChange={(newValue) => {
                if (value === newValue) return
                setPayloadParameters((prev) => {
                  if (newValue) return [...prev, paramName]
                  return prev.filter((p) => p !== paramName)
                })
              }}
            />
          </div>
        )
      })}
      {parameterNames.length > 0 && (
        <Text.H6 color='foregroundMuted' isItalic>
          Note: "Payload" refers to the data received from the trigger event. We
          currently do not know the exact structure of this data, so you may
          need to test your trigger to see what data is available.
        </Text.H6>
      )}
    </div>
  )
}

export function IntegrationTriggerConfig({
  integration,
  component,
  document,
  configuredProps,
  setConfiguredProps,
  payloadParameters,
  setPayloadParameters,
  disabled = false,
}: {
  integration: IntegrationDto
  component: PipedreamComponent<PipedreamComponentType.Trigger>
  document: DocumentVersion
  configuredProps: ConfiguredProps<ConfigurableProps>
  setConfiguredProps: ReactStateDispatch<ConfiguredProps<ConfigurableProps>>
  payloadParameters: string[]
  setPayloadParameters: ReactStateDispatch<string[]>
  disabled?: boolean
}) {
  return (
    <div className='flex flex-col gap-8'>
      <PipedreamComponentPropsForm
        integration={integration}
        component={component}
        values={configuredProps}
        onChange={setConfiguredProps}
        disabled={disabled}
      />
      <ParameterSelects
        document={document}
        payloadParameters={payloadParameters}
        setPayloadParameters={setPayloadParameters}
        disabled={disabled}
      />
    </div>
  )
}
