import { useCallback } from 'react'
import type { DocumentVersion, LinkedDatasetRow } from '@latitude-data/core/browser'
import { getDocState, type InputsByDocument } from '$/hooks/useDocumentParameters/utils'
import useDocumentVersions from '$/stores/documentVersions'
import type { useLocalStorage } from '@latitude-data/web-ui/hooks/useLocalStorage'

export function useDatasetUtils({
  key,
  projectId,
  commitUuid,
  document,
  allInputs,
  setValue,
}: {
  document: DocumentVersion
  projectId: number
  commitUuid: string
  key: string
  allInputs: ReturnType<typeof useLocalStorage<InputsByDocument>>['value']
  setValue: ReturnType<typeof useLocalStorage<InputsByDocument>>['setValue']
}) {
  const { saveLinkedDataset, assignDataset, isAssigning } = useDocumentVersions({
    projectId,
    commitUuid,
  })
  const setDatasetMappedInputs = useCallback(
    ({
      datasetId,
      datasetRowId: nextDatasetRowId,
      inputs: nextInputs,
      mappedInputs: nextMappedInputs,
    }: {
      datasetId: number
      datasetRowId: number
      inputs: LinkedDatasetRow['inputs'] | undefined
      mappedInputs: LinkedDatasetRow['mappedInputs'] | undefined
    }) => {
      setValue((oldState) => {
        const { state, doc } = getDocState(oldState, key)
        const prevDatasetState = doc.datasetV2 ?? {}
        const prevSource = doc.datasetV2?.[datasetId] ?? {
          datasetRowId: nextDatasetRowId,
          inputs: nextInputs ?? {},
          mappedInputs: nextMappedInputs ?? {},
        }
        const datasetRowId = nextDatasetRowId ?? prevSource.datasetRowId
        const mappedInputs = nextMappedInputs ?? prevSource.mappedInputs
        const inputs = nextInputs ?? prevSource.inputs

        return {
          ...state,
          [key]: {
            ...doc,
            datasetV2: {
              ...prevDatasetState,
              [datasetId]: {
                datasetRowId,
                mappedInputs,
                inputs,
              },
            },
          },
        }
      })
    },
    [key, setValue],
  )

  const setDataset = useCallback(
    async ({
      datasetId,
      data,
    }: {
      datasetId: number
      data?: {
        datasetRowId: number
        mappedInputs: LinkedDatasetRow['mappedInputs'] | undefined
        inputs: LinkedDatasetRow['inputs'] | undefined
      }
    }) => {
      if (datasetId !== document.datasetV2Id) {
        await assignDataset({
          documentUuid: document.documentUuid,
          projectId,
          commitUuid,
          datasetId,
        })
      }

      if (!data || !data?.datasetRowId) return

      const { doc } = getDocState(allInputs, key)
      const datasetDoc = doc.datasetV2?.[datasetId] ?? {
        datasetRowId: data?.datasetRowId,
        inputs: data?.inputs ?? {},
        mappedInputs: data?.mappedInputs ?? {},
      }
      const prevDatasetRowId = datasetDoc.datasetRowId
      const prevInputs = datasetDoc.inputs
      const prevMappedInputs = datasetDoc.mappedInputs

      // Optimistic update in local storage
      setDatasetMappedInputs({
        datasetId,
        inputs: data.inputs,
        mappedInputs: data.mappedInputs,
        datasetRowId: data?.datasetRowId,
      })

      const [_, error] = await saveLinkedDataset({
        projectId,
        commitUuid,
        documentUuid: document.documentUuid,
        datasetId,
        datasetRowId: data?.datasetRowId,
        mappedInputs: data?.mappedInputs ?? {},
        inputs: data?.inputs ?? {},
      })

      if (error) {
        setDatasetMappedInputs({
          datasetId,
          inputs: prevInputs,
          mappedInputs: prevMappedInputs,
          datasetRowId: prevDatasetRowId,
        })
      }
    },
    [
      saveLinkedDataset,
      assignDataset,
      projectId,
      commitUuid,
      document.documentUuid,
      document.datasetV2Id,
      key,
      setDatasetMappedInputs,
      allInputs,
    ],
  )

  return {
    setDataset,
    isAssigning,
  }
}
