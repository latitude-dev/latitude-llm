import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import {
  Dataset,
  LinkedDataset,
  DocumentVersion,
  PlaygroundInput,
  DatasetV2,
  DatasetVersion,
} from '@latitude-data/core/browser'
import {
  ClientOnly,
  SelectOption,
  Text,
  type ICommitContextType,
} from '@latitude-data/web-ui'

import { InputsMapperItem, OnSelectRowCellFn } from './InputsMapperItem'

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

export function DatasetsV1InputMapper({
  document,
  commit,
  mappedInputs,
  rowCellOptions,
  isLoading,
  onSelectRowCell,
  selectedDataset,
  datasetVersion,
}: {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  mappedInputs: LinkedDataset['mappedInputs']
  rowCellOptions: SelectOption<number>[]
  onSelectRowCell: OnSelectRowCellFn<number>
  isLoading: boolean
  selectedDataset: Dataset | DatasetV2 | undefined
  datasetVersion: DatasetVersion
}) {
  const { setSource, dataset: ds } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
    datasetVersion,
  })
  const copyToManual = ds.copyToManual
  const inputs = ds.inputs as LinkedDataset['inputs']
  const inputKeys = Object.entries(inputs)

  return (
    <ClientOnly>
      <div className='flex flex-col gap-3'>
        {Object.keys(inputs).length > 0 ? (
          <div className='grid grid-cols-[auto_1fr] gap-y-3'>
            {inputKeys.map(([param, input], idx) => {
              const value = mappedInputs[param]
              const inputTooltipValue = getTooltipValue(input)
              const isMapped = mappedInputs[param] !== undefined
              const disabled = isLoading || !selectedDataset
              return (
                <InputsMapperItem
                  key={idx}
                  value={value}
                  isLoading={isLoading}
                  datasetVersion={DatasetVersion.V1}
                  disabled={disabled}
                  isMapped={isMapped}
                  param={param}
                  onSelectRowCell={onSelectRowCell}
                  rowCellOptions={rowCellOptions}
                  setSource={setSource}
                  tooltipValue={inputTooltipValue}
                  copyToManual={copyToManual}
                />
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
