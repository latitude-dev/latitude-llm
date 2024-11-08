import { useCallback } from 'react'

import { Dataset, DocumentVersion } from '@latitude-data/core/browser'
import { AppLocalStorage, useLocalStorage } from '@latitude-data/web-ui'

export type SelectedDatasetRow = {
  rowIndex: number
  datasetId: number | undefined
  mappedInputs: Record<string, number>
}

type SelectedRowByDocumentDataset = Record<string, SelectedDatasetRow>
export function useSelectedDatasetRow({
  document,
  dataset,
}: {
  document: DocumentVersion
  dataset: Dataset | undefined
}) {
  const key = `${document.documentUuid}:${dataset?.id}`
  const { value: allValues, setValue } =
    useLocalStorage<SelectedRowByDocumentDataset>({
      key: AppLocalStorage.playgroundParamsSelectedDatasetRow,
      defaultValue: {},
    })

  const saveRowInfo = useCallback(
    (selected: SelectedDatasetRow) => {
      setValue((prev) => {
        const prevSelected = prev ? prev[key] : {}
        return {
          ...prev,
          [key]: {
            ...prevSelected,
            ...selected,
          },
        }
      })
    },
    [allValues, key, setValue],
  )

  const selectedRow = allValues[key]
  return {
    selectedRow,
    saveRowInfo,
  }
}
