import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import {
  DocumentVersion,
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
import { UseSelectDataset } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/_components/DocumentEditor/Editor/Playground/DocumentParams/DatasetParams/useSelectDataset'

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
  rowCellOptions,
  loadingState,
  onSelectRowCell,
  datasetVersion,
}: {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  rowCellOptions: SelectOption<string>[]
  onSelectRowCell: OnSelectRowCellFn<string>
  loadingState: UseSelectDataset['loadingState']
  datasetVersion: DatasetVersion
}) {
  const { setSource, datasetV2: ds } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
    datasetVersion,
  })
  const inputs = ds.inputs
  console.log("INPUTS", inputs)
  const mappedInputs = ds.mappedInputs
  const inputKeys = Object.entries(inputs)
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
                  datasetVersion={DatasetVersion.V2}
                  isMapped={isMapped}
                  param={param}
                  onSelectRowCell={onSelectRowCell}
                  loadingState={loadingState}
                  rowCellOptions={rowCellOptions as SelectOption<string>[]}
                  setSource={setSource}
                  tooltipValue={inputTooltipValue}
                  copyToManual={ds.copyToManual}
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
