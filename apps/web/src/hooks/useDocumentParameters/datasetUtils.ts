import { useCallback } from 'react'
import {
  DatasetVersion,
  DocumentVersion,
  InputSource,
  LinkedDatasetRow,
} from '@latitude-data/core/browser'
import {
  getDocState,
  InputsByDocument,
} from '$/hooks/useDocumentParameters/utils'
import useDocumentVersions from '$/stores/documentVersions'
import { useLocalStorage } from '@latitude-data/web-ui/hooks/useLocalStorage'

export function useDatasetUtils({
  key,
  source,
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
  source: InputSource
  allInputs: ReturnType<typeof useLocalStorage<InputsByDocument>>['value']
  setValue: ReturnType<typeof useLocalStorage<InputsByDocument>>['setValue']
}) {
  const { saveLinkedDataset, assignDataset, isAssigning } = useDocumentVersions(
    {
      projectId,
      commitUuid,
    },
  )
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
        const prevDatasetState = doc['datasetV2'] ?? {}
        const prevSource = doc['datasetV2'][datasetId] ?? {
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
    [allInputs, key, source, setValue],
  )

  const setDataset = useCallback(
    async ({
      datasetId,
      datasetVersion,
      data,
    }: {
      datasetId: number
      datasetVersion: DatasetVersion
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
          datasetVersion: DatasetVersion.V2,
        })
      }

      if (!data || !data?.datasetRowId) return

      const { doc } = getDocState(allInputs, key)
      const datasetDoc = doc['datasetV2'][datasetId] ?? {
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
        datasetVersion,
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
      allInputs,
      key,
    ],
  )

  return {
    setDataset,
    isAssigning,
  }
}
