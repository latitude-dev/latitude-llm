import { useDocumentParameters } from '$/hooks/useDocumentParameters'
import { DocumentVersion, PlaygroundInput } from '@latitude-data/core/browser'
import { SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { ICommitContextType } from '@latitude-data/web-ui/providers'

import { InputsMapperItem, OnSelectRowCellFn } from './InputsMapperItem'
import { type UseSelectDataset } from '../useSelectDataset'
import { ParametersWrapper } from '../../ParametersWrapper'

function getTooltipValue(input: PlaygroundInput<'datasetV2'>) {
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
}: {
  document: DocumentVersion
  commit: ICommitContextType['commit']
  rowCellOptions: SelectOption<string>[]
  onSelectRowCell: OnSelectRowCellFn<string>
  loadingState: UseSelectDataset['loadingState']
}) {
  const { setSource, datasetV2: ds } = useDocumentParameters({
    document,
    commitVersionUuid: commit.uuid,
  })
  const inputs = ds.inputs
  const mappedInputs = ds.mappedInputs
  return (
    <ParametersWrapper document={document} commit={commit}>
      {({ metadataParameters }) =>
        metadataParameters.map((param, idx) => {
          const input = inputs?.[param]

          if (!input) return null

          const identifier = mappedInputs[param]
          const inputTooltipValue = getTooltipValue(input)
          const isMapped = identifier !== undefined
          return (
            <InputsMapperItem
              key={idx}
              value={identifier}
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
        })
      }
    </ParametersWrapper>
  )
}
