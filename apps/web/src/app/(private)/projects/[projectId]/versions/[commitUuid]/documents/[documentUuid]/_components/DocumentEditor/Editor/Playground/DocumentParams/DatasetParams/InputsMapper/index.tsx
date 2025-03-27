import { useCallback } from 'react'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import {
  Dataset,
  DocumentVersion,
  DatasetV2,
  DatasetVersion,
  PlaygroundInput,
} from '@latitude-data/core/browser'
import {
  ClientOnly,
  SelectOption,
  Text,
  type ICommitContextType,
} from '@latitude-data/web-ui'

import { InputsMapperItem, OnSelectRowCellFn } from './InputsMapperItem'
import { type DatasetMappedValue } from '../useDatasetRowsForParameters'

function getTooltipValue(input: PlaygroundInput<'datasetV2'>) {
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
  commit,
  parameters,
  rowCellOptions,
  isLoading,
  onSelectRowCell,
  selectedDataset,
  datasetVersion,
}: {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  parameters: DatasetMappedValue[]
  rowCellOptions: SelectOption<string>[]
  onSelectRowCell: OnSelectRowCellFn<string>
  isLoading: boolean
  selectedDataset: Dataset | DatasetV2 | undefined
  datasetVersion: DatasetVersion
}) {
  const {
    setSource,
    datasetV2: ds,
    manual: { setInputs: setManualInputs },
  } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
    datasetVersion,
  })
  const copyToManual = useCallback(() => {
    // TODO: Move to useDocumentParameters
    // const manualInputs = parameters.reduce(
    //   (acc, param) => {
    //     const name = param.param
    //     acc[name] = {
    //       value: String(param.value),
    //       metadata: { includeInPrompt: true },
    //     }
    //     return acc
    //   },
    //   {} as Record<string, PlaygroundInput<'manual'>>,
    // )
    //
    // setManualInputs(manualInputs)
  }, [parameters, setManualInputs])
  const inputs = ds.inputs
  const mappedInputs = ds.mappedInputs
  const inputKeys = Object.entries(inputs)
  const disabled = !selectedDataset || isLoading

  return (
    <ClientOnly>
      <div className='flex flex-col gap-3'>
        {inputKeys.length > 0 ? (
          <div className='grid grid-cols-[auto_1fr] gap-y-3'>
            {inputKeys.map(([param, input], idx) => {
              const identifier = mappedInputs[param]
              const inputTooltipValue = getTooltipValue(input)
              const isMapped = identifier !== undefined
              return (
                <InputsMapperItem
                  key={idx}
                  value={identifier}
                  isLoading={isLoading}
                  datasetVersion={DatasetVersion.V2}
                  disabled={disabled}
                  isMapped={isMapped}
                  param={param}
                  onSelectRowCell={onSelectRowCell}
                  rowCellOptions={rowCellOptions as SelectOption<string>[]}
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
