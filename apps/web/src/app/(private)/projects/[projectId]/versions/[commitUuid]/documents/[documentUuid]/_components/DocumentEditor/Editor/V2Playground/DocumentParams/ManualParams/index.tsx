import { useDebouncedCallback } from 'use-debounce'
import { ParameterInput } from '$/components/ParameterInput'
import {
  UseDocumentParameters,
  useDocumentParameters,
} from '$/hooks/useDocumentParameters'
import { ParameterType } from '@latitude-data/constants'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { ParameterTypeSelector } from './ParameterTypeSelector'
import { Props } from '../index'
import { ParametersWrapper } from '../ParametersWrapper'
import { PlaygroundInput } from '@latitude-data/core/lib/documentPersistedInputs'

type ManualParameterProps = {
  param: string
  input: PlaygroundInput<'manual'>
  setInput: UseDocumentParameters['manual']['setInput']
  parameterType: ParameterType
}

function LocalParameterInput({ param, input, setInput }: ManualParameterProps) {
  const setInputDebounced = useDebouncedCallback(
    async (value: string) => {
      setInput(param, { ...input, value })
    },
    100,
    { trailing: true },
  )

  return (
    <ParameterInput
      name={param}
      value={input.value}
      type={input.metadata.type || ParameterType.Text}
      onChange={setInputDebounced}
    />
  )
}

export function ManualParams({ document, commit, prompt, setPrompt }: Props) {
  const {
    manual: { inputs, setInput },
  } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
  })

  return (
    <ParametersWrapper document={document} commit={commit}>
      {({ metadataParameters }) =>
        metadataParameters.map((param, idx) => {
          const input = inputs?.[param]
          if (!input) return null

          const includedInPrompt = input.metadata.includeInPrompt ?? true
          return (
            <div
              key={idx}
              className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'
            >
              <div className='flex flex-row items-center gap-x-2 min-h-8'>
                <ParameterTypeSelector
                  parameter={param}
                  inputs={inputs}
                  setInput={setInput}
                  prompt={prompt}
                  setPrompt={setPrompt}
                  disabled={commit.mergedAt !== null}
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
                <LocalParameterInput
                  param={param}
                  input={input}
                  setInput={setInput}
                  parameterType={input.metadata.type || ParameterType.Text}
                />
              </div>
            </div>
          )
        })
      }
    </ParametersWrapper>
  )
}
