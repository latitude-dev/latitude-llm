import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import {
  Dataset,
  DocumentVersion,
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
import { useCallback } from 'react'
import { type DatasetMappedValue } from '../useDatasetRowsForParameters'

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
  datasetVersion: DatasetVersion | undefined
}) {
  const { setSource } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
    datasetVersion,
  })
  // TODO: Implement this
  const copyToManual = useCallback(() => {}, [])
  const disabled = !selectedDataset || isLoading
  return (
    <ClientOnly>
      <div className='flex flex-col gap-3'>
        {parameters.length > 0 ? (
          <div className='grid grid-cols-[auto_1fr] gap-y-3'>
            {parameters.map((mapped, idx) => (
              <InputsMapperItem
                key={idx}
                value={mapped.columnIdentifier}
                isLoading={isLoading}
                datasetVersion={DatasetVersion.V2}
                disabled={disabled}
                isMapped={mapped.isMapped}
                param={mapped.param}
                onSelectRowCell={onSelectRowCell}
                rowCellOptions={rowCellOptions as SelectOption<string>[]}
                setSource={setSource}
                tooltipValue={{
                  value: mapped.value,
                  isEmpty: mapped.isEmpty,
                }}
                copyToManual={copyToManual}
              />
            ))}
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
