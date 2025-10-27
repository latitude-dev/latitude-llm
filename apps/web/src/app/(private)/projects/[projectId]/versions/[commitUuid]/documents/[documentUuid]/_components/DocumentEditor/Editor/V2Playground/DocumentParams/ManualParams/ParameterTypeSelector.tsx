import { useMemo } from 'react'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Select } from '@latitude-data/web-ui/atoms/Select'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { SelectTriggerPrimitive } from '@latitude-data/web-ui/atoms/Select'
import { ParameterType } from '@latitude-data/constants'
import { updatePromptMetadata } from '@latitude-data/core/lib/updatePromptMetadata'
import {
  Inputs,
  InputSource,
  PlaygroundInput,
} from '@latitude-data/core/lib/documentPersistedInputs'

const ParameterTypes = Object.values(ParameterType) as string[]

const ParameterTypeDetails = {
  [ParameterType.Text]: {
    label: 'Text',
    icon: <Icon name='letterText' />,
  },
  [ParameterType.Image]: {
    label: 'Image',
    icon: <Icon name='image' />,
  },
  [ParameterType.File]: {
    label: 'File',
    icon: <Icon name='paperclip' />,
  },
}

// TODO: Because document edition is debounced, when the type
// changes it delays the render and the experience is very odd
export function ParameterTypeSelector({
  parameter,
  inputs,
  setInput,
  prompt,
  setPrompt,
  disabled = false,
}: {
  parameter: string
  inputs: Inputs<InputSource>
  setInput: (param: string, value: PlaygroundInput<InputSource>) => void
  prompt: string
  setPrompt: (prompt: string) => void
  disabled?: boolean
}) {
  const input = inputs[parameter]!
  const parameters = useMemo(
    () =>
      Object.entries(inputs).reduce(
        (acc, [param, input]) => {
          if (input.metadata.type) acc[param] = { type: input.metadata.type }
          return acc
        },
        {} as Record<string, { type: ParameterType }>,
      ),
    [inputs],
  )
  const selectedType = useMemo(
    () =>
      ParameterTypes.includes(input.metadata.type || '')
        ? input.metadata.type
        : ParameterType.Text,
    [input.metadata.type],
  )!

  return (
    <Select
      name='type'
      value={selectedType}
      onChange={(value) => {
        setInput(parameter, { ...input, value: '' })

        parameters[parameter] = { type: value as ParameterType }
        setPrompt(
          updatePromptMetadata(prompt, {
            parameters: parameters,
          }),
        )
      }}
      options={Object.values(ParameterType).map((type) => ({
        value: type,
        label: ParameterTypeDetails[type].label,
        icon: ParameterTypeDetails[type].icon,
      }))}
      disabled={disabled}
      width='auto'
      trigger={
        <Tooltip
          asChild
          trigger={
            <SelectTriggerPrimitive className='focus:outline-none flex items-center justify-center gap-x-0.5 text-muted-foreground hover:text-primary transition colors'>
              {ParameterTypeDetails[selectedType].icon}
              {!disabled && <Icon name='chevronsUpDown' size='small' />}
            </SelectTriggerPrimitive>
          }
        >
          {ParameterTypeDetails[selectedType].label} parameter
        </Tooltip>
      }
    />
  )
}
