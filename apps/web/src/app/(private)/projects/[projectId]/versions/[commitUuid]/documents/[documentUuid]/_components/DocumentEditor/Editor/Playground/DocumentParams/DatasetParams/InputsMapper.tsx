import { Dataset, DocumentVersion } from '@latitude-data/core/browser'
import {
  Badge,
  Button,
  ClientOnly,
  Icon,
  Select,
  Text,
  Tooltip,
} from '@latitude-data/web-ui'
import {
  DatasetSource,
  PlaygroundInput,
  useDocumentParameters,
} from '$/hooks/useDocumentParameters'

import { UseSelectDataset, type DatasetPreview } from './useSelectDataset'

function getTooltipValue(input: PlaygroundInput<'dataset'>) {
  if (input === undefined || input === null) {
    return { isEmpty: true, value: 'No value found' }
  }

  const value = typeof input === 'string' ? input : input.value
  const isEmpty = value === ''
  return {
    isEmpty,
    value: isEmpty ? 'Empty value' : value,
  }
}

export function InputMapper({
  document,
  commitVersionUuid,
  mappedInputs,
  headersOptions,
  isLoading,
  onSelectHeader,
  selectedDataset,
}: {
  document: DocumentVersion
  commitVersionUuid: string
  mappedInputs: DatasetSource['mappedInputs']
  headersOptions: DatasetPreview['headersOptions']
  onSelectHeader: UseSelectDataset['onSelectHeader']
  isLoading: boolean
  selectedDataset: Dataset | undefined
}) {
  const {
    setSource,
    dataset: { inputs, copyToManual },
  } = useDocumentParameters({
    documentVersionUuid: document.documentUuid,
    commitVersionUuid,
  })
  return (
    <ClientOnly>
      <div className='flex flex-col gap-3'>
        {Object.keys(inputs).length > 0 ? (
          <div className='grid grid-cols-[auto_1fr] gap-y-3'>
            {Object.entries(inputs).map(([param, input], idx) => {
              const value = mappedInputs[param]
              const inputTooltipValue = getTooltipValue(input)
              const isMapped = mappedInputs[param] !== undefined
              const disabled = isLoading || !selectedDataset
              return (
                <div
                  className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'
                  key={idx}
                >
                  <div className='flex flex-row items-center gap-x-1 min-h-8'>
                    <Badge variant={isMapped ? 'accent' : 'muted'}>
                      &#123;&#123;{param}&#125;&#125;
                    </Badge>
                    {!isMapped ? (
                      <Tooltip trigger={<Icon name='info' />}>
                        This variable is not mapped to any row header
                      </Tooltip>
                    ) : null}
                  </div>
                  <div className='flex flex-grow min-w-0 items-start w-full'>
                    <div className='flex flex-col flex-grow min-w-0 gap-y-1'>
                      <Select
                        name='datasetId'
                        placeholder={
                          isLoading ? 'Loading...' : 'Choose row header'
                        }
                        disabled={disabled}
                        options={headersOptions}
                        onChange={onSelectHeader(param)}
                        value={value}
                      />
                      <div className='flex flex-row items-center gap-x-2 flex-grow min-w-0'>
                        <Text.H6 color='foregroundMuted' ellipsis noWrap>
                          {inputTooltipValue.value}
                        </Text.H6>
                      </div>
                    </div>
                    <div className='min-h-8 flex flex-row items-center'>
                      <Tooltip
                        asChild
                        trigger={
                          <Button
                            variant='ghost'
                            disabled={disabled || !value}
                            onClick={() => {
                              copyToManual()
                              setSource('manual')
                            }}
                            iconProps={{ name: 'pencil' }}
                          />
                        }
                      >
                        Edit the value
                      </Tooltip>
                    </div>
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
