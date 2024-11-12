import { useCallback } from 'react'

import { DocumentVersion } from '@latitude-data/core/browser'
import { AppLocalStorage, useLocalStorage } from '@latitude-data/web-ui'

export type SelectedLogRow = {
  documentLogUuid: string | undefined
}

type SelectedRowByDocumentDataset = Record<string, SelectedLogRow>
export function useSelectedLogRow({ document }: { document: DocumentVersion }) {
  const key = `${document.documentUuid}:documentLogUuid`
  const { value: allValues, setValue } =
    useLocalStorage<SelectedRowByDocumentDataset>({
      key: AppLocalStorage.playgroundParamsSelectedLogRow,
      defaultValue: {},
    })

  const saveRowInfo = useCallback(
    ({ documentLogUuid }: SelectedLogRow) => {
      setValue((prev) => {
        return {
          ...prev,
          [key]: { documentLogUuid },
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
