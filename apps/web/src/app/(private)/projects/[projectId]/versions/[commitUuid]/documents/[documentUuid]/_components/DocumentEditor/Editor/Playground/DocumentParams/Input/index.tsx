import { ChangeEvent, useCallback, useMemo } from 'react'

import {
  Inputs,
  InputSource,
  PlaygroundInput,
} from '$/hooks/useDocumentParameters'
import { updatePromptMetadata } from '$/lib/promptMetadata'
import useFiles from '$/stores/files'
import {
  ParameterType,
  SUPPORTED_IMAGE_TYPES,
} from '@latitude-data/core/browser'
import {
  Badge,
  ClientOnly,
  DropzoneInput,
  Icon,
  Select,
  SelectTriggerPrimitive,
  Skeleton,
  Text,
  TextArea,
  Tooltip,
  type ICommitContextType,
} from '@latitude-data/web-ui'

export function InputParams({
  inputs,
  setInput,
  commit,
  prompt,
  setPrompt,
  disabled = false,
}: {
  inputs: Inputs<InputSource>
  setInput: (param: string, value: PlaygroundInput<InputSource>) => void
  commit: ICommitContextType['commit']
  prompt?: string
  setPrompt?: (prompt: string) => void
  disabled?: boolean
}) {
  return (
    <ClientOnly>
      <div className='flex flex-col gap-3'>
        {Object.keys(inputs).length > 0 ? (
          <div className='grid grid-cols-[auto_1fr] gap-y-3'>
            {Object.entries(inputs).map(([param, input], idx) => {
              const includedInPrompt = input.metadata.includeInPrompt ?? true
              return (
                <div
                  className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'
                  key={idx}
                >
                  <div className='flex flex-row items-center gap-x-2 min-h-8'>
                    <ParameterTypeSelector
                      parameter={param}
                      inputs={inputs}
                      setInput={setInput}
                      prompt={prompt}
                      setPrompt={setPrompt}
                      disabled={commit.mergedAt !== null || disabled}
                    />
                    <Badge variant={includedInPrompt ? 'accent' : 'muted'}>
                      &#123;&#123;{param}&#125;&#125;
                    </Badge>
                    {!includedInPrompt && (
                      <Tooltip trigger={<Icon name='info' />}>
                        This variable is not included in the current prompt
                      </Tooltip>
                    )}
                  </div>
                  <div className='flex flex-grow w-full min-w-0'>
                    <ParameterInput
                      parameter={param}
                      input={input}
                      setInput={setInput}
                      disabled={disabled}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <Text.H6 color='foregroundMuted'>
            No inputs. Use &#123;&#123;input_name&#125;&#125; to insert.
          </Text.H6>
        )}
      </div>
    </ClientOnly>
  )
}

const ParameterTypeDetails = {
  [ParameterType.Text]: {
    label: 'Text',
    icon: <Icon name='letterText' />,
  },
  [ParameterType.Document]: {
    label: 'Document',
    icon: <Icon name='paperclip' />,
  },
  [ParameterType.Image]: {
    label: 'Image',
    icon: <Icon name='image' />,
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
  prompt?: string
  setPrompt?: (prompt: string) => void
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
    () => input.metadata.type || ParameterType.Text,
    [parameter, inputs],
  )

  return (
    <Select
      name='type'
      value={selectedType}
      onChange={(value) => {
        setInput(parameter, {
          ...input,
          value: '',
          metadata: {
            ...input.metadata,
            filename: undefined,
          },
        })

        if (prompt && setPrompt) {
          parameters[parameter] = { type: value as ParameterType }
          setPrompt(
            updatePromptMetadata(prompt, {
              parameters: parameters,
            }),
          )
        }
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

function ParameterInputSkeleton() {
  return <Skeleton className='w-full h-8 rounded-md bg-muted animate-pulse' />
}

function ParameterInput({
  parameter,
  input,
  setInput,
  disabled = false,
}: {
  parameter: string
  input: PlaygroundInput<InputSource>
  setInput: (param: string, value: PlaygroundInput<InputSource>) => void
  disabled?: boolean
}) {
  const { uploadFile, convertFile, isLoading } = useFiles()

  const onTextChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      setInput(parameter, { ...input, value: e.target.value })
    },
    [setInput],
  )

  const onDocumentChange = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0]
      if (file) {
        const content = await convertFile({ file })
        if (content) {
          setInput(parameter, {
            ...input,
            value: content,
            metadata: {
              ...input.metadata,
              filename: file.name,
            },
          })
          return
        }
      }

      setInput(parameter, {
        ...input,
        value: '',
        metadata: {
          ...input.metadata,
          filename: undefined,
        },
      })
    },
    [convertFile, setInput],
  )

  const onImageChange = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0]
      if (file) {
        const url = await uploadFile({ file })
        if (url) {
          setInput(parameter, {
            ...input,
            value: url,
            metadata: {
              ...input.metadata,
              filename: file.name,
            },
          })
          return
        }
      }

      setInput(parameter, {
        ...input,
        value: '',
        metadata: {
          ...input.metadata,
          filename: undefined,
        },
      })
    },
    [uploadFile, setInput],
  )

  switch (input.metadata.type || ParameterType.Text) {
    case ParameterType.Text:
      return (
        <TextArea
          value={input.value ?? ''}
          onChange={onTextChange}
          minRows={1}
          maxRows={6}
          disabled={disabled}
        />
      )

    case ParameterType.Document:
      return isLoading ? (
        <ParameterInputSkeleton />
      ) : (
        <DropzoneInput
          icon='fileUp'
          inputSize='small'
          placeholder='Upload document'
          defaultFilename={input.metadata.filename}
          onChange={onDocumentChange}
          accept={undefined}
          multiple={false}
          disabled={disabled}
        />
      )

    case ParameterType.Image:
      return isLoading ? (
        <ParameterInputSkeleton />
      ) : (
        <DropzoneInput
          icon='imageUp'
          inputSize='small'
          placeholder='Upload image'
          defaultFilename={input.metadata.filename}
          onChange={onImageChange}
          accept={SUPPORTED_IMAGE_TYPES.join(',')}
          multiple={false}
          disabled={disabled}
        />
      )

    default:
      return (
        <TextArea
          value={'Parameter type not supported'}
          minRows={1}
          maxRows={1}
          disabled={true}
        />
      )
  }
}
