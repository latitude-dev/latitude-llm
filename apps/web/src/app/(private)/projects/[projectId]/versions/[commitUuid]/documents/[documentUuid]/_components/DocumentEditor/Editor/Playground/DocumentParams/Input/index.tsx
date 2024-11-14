import {
  Badge,
  ClientOnly,
  Icon,
  Text,
  TextArea,
  Tooltip,
} from '@latitude-data/web-ui'
import {
  PlaygroundInput,
  PlaygroundInputs,
} from '$/hooks/useDocumentParameters'
import { useFeatureFlag } from '$/hooks/useFeatureFlag'

export function InputParams({
  inputs,
  setInput,
  showTitle = false,
}: {
  inputs: PlaygroundInputs
  setInput: (param: string, value: PlaygroundInput) => void
  // FIXME: remove title. Temporal until new params are fully implemented
  showTitle?: boolean
}) {
  // FiXME: Remove after new params is open
  const newParams = useFeatureFlag()
  return (
    <ClientOnly>
      <div className='flex flex-col gap-3'>
        {showTitle && <Text.H6M>Inputs</Text.H6M>}
        {Object.keys(inputs).length > 0 ? (
          <div className='grid grid-cols-[auto_1fr] gap-y-3'>
            {Object.entries(inputs).map(([param, input], idx) => {
              const value = typeof input === 'string' ? input : input.value
              const includedInPrompt =
                typeof input === 'string' ? true : input.includedInPrompt
              return (
                <div
                  className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'
                  key={idx}
                >
                  <div className='flex flex-row items-center gap-x-1 min-h-8'>
                    <Badge variant={includedInPrompt ? 'accent' : 'muted'}>
                      &#123;&#123;{param}&#125;&#125;
                    </Badge>
                    {!includedInPrompt ? (
                      <Tooltip trigger={<Icon name='info' />}>
                        This variable is not included in the current prompt
                      </Tooltip>
                    ) : null}
                  </div>
                  <div className='flex flex-grow w-full'>
                    <TextArea
                      value={value ?? ''}
                      minRows={1}
                      maxRows={6}
                      onChange={(e) => {
                        const newValue = e.target.value
                        const newInput = newParams
                          ? {
                              ...(typeof input === 'string' ? {} : input),
                              value: newValue,
                              includedInPrompt,
                            }
                          : newValue
                        setInput(param, newInput)
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <Text.H6 color='foregroundMuted'>
            No inputs. Use &#123;&#123; input_name &#125;&#125; to insert.
          </Text.H6>
        )}
      </div>
    </ClientOnly>
  )
}
