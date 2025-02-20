import { useDocumentParameters } from '$/hooks/useDocumentParameters'

import { Props } from '../index'

import { ParameterInput } from '$/components/ParameterInput'
import { ParameterType } from '@latitude-data/constants'
import { Badge, ClientOnly, Icon, Text, Tooltip } from '@latitude-data/web-ui'
import { ParameterTypeSelector } from './ParameterTypeSelector'

export function ManualParams({ document, commit, prompt, setPrompt }: Props) {
  const {
    manual: { inputs, setInput },
  } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
  })
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
                    <ParameterInput
                      type={input.metadata.type || ParameterType.Text}
                      value={input.value ?? ''}
                      onChange={(value) => setInput(param, { ...input, value })}
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
