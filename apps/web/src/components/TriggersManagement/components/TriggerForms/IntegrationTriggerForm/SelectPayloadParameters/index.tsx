import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { useCallback, useMemo } from 'react'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { useMetadataParameters } from '$/hooks/useMetadataParameters'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { Select, type SelectOption } from '@latitude-data/web-ui/atoms/Select'

export function SelectPayloadParameters({
  payloadParameters,
  setPayloadParameters,
}: {
  payloadParameters: string[]
  setPayloadParameters: ReactStateDispatch<string[]>
  value?: string
}) {
  const { parameters: parameterNames } = useMetadataParameters()
  const options = useMemo<SelectOption<string>[]>(
    () =>
      parameterNames.map((value) => ({
        label: value,
        value,
      })),
    [parameterNames],
  )
  const value = payloadParameters[0]
  const onSelectChange = useCallback(
    (value: string) => {
      setPayloadParameters([value])
    },
    [setPayloadParameters],
  )
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-row gap-x-1'>
        <Text.H5M>Prompt Parameter</Text.H5M>
        <Tooltip trigger={<Icon name='info' />}>
          Note: "Payload" refers to the data received from the trigger event. We
          currently do not know the exact structure of this data, so you may
          need to test your trigger to see what data is available.
        </Tooltip>
      </div>
      {parameterNames.length <= 0 ? (
        <Text.H6 color='foregroundMuted'>
          This prompt has no parameters. You can add a{' '}
          <Badge variant='accent'>{'{{payload}}'}</Badge> parameter to use the
          entire payload data.
        </Text.H6>
      ) : (
        <Select<string>
          name='payload-parameter'
          value={value}
          options={options}
          onChange={onSelectChange}
          description='Pick the parameter in your prompt that corresponds to the payload data. This will be used when the trigger event occurs.'
        />
      )}
    </div>
  )
}
