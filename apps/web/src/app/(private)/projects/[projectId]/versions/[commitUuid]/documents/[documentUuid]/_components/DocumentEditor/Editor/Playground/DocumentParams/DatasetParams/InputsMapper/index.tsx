import { useCallback } from 'react'
import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import {
  Dataset,
  DocumentVersion,
  DatasetV2,
  DatasetVersion,
  PlaygroundInput,
} from '@latitude-data/core/browser'
import { ClientOnly } from '@latitude-data/web-ui/atoms/ClientOnly'
import { SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ICommitContextType } from '@latitude-data/web-ui/providers'

import { InputsMapperItem, OnSelectRowCellFn } from './InputsMapperItem'
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
  datasetVersion: DatasetVersion
}) {
  const {
    setSource,
    manual: { setInputs: setManualInputs },
  } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
    datasetVersion,
  })
  const copyToManual = useCallback(() => {
    const manualInputs = parameters.reduce(
      (acc, param) => {
        const name = param.param
        acc[name] = {
          value: String(param.value),
          metadata: { includeInPrompt: true },
        }
        return acc
      },
      {} as Record<string, PlaygroundInput<'manual'>>,
    )

    setManualInputs(manualInputs)
  }, [parameters, setManualInputs])
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
