import { useCallback } from 'react'

import { recalculateInputs } from '$/hooks/useDocumentParameters/recalculateInputs'
import {
  DatasetVersion,
  DocumentLog,
  DocumentVersion,
  INPUT_SOURCE,
  Inputs,
  InputSource,
  LinkedDataset,
  LinkedDatasetRow,
  LocalInputs,
  LocalInputSource,
  PlaygroundInput,
  PlaygroundInputs,
} from '@latitude-data/core/browser'
import type { ConversationMetadata } from 'promptl-ai'
import {
  AppLocalStorage,
  useCurrentProject,
  useLocalStorage,
} from '@latitude-data/web-ui'
import useDocumentVersions from '$/stores/documentVersions'
import {
  getLocalStorageInputsBySource,
  useAsyncDocumentParameters,
} from './useAsyncDocumentParameters'
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'

const EMPTY_LINKED_DATASET = {
  rowIndex: 0,
  inputs: {} as LinkedDataset['inputs'],
  mappedInputs: {} as LinkedDataset['mappedInputs'],
}

const EMPTY_LINKED_DATASET_ROW: LinkedDatasetRow = {
  datasetRowId: 0, // This is wrong. This is an ID in DB. But allows to have this attribute as non optional
  mappedInputs: {} as LinkedDatasetRow['mappedInputs'],
}

const EMPTY_INPUTS: PlaygroundInputs<'manual'> = {
  source: INPUT_SOURCE.manual,
  manual: { inputs: {} },
  dataset: {
    datasetId: undefined,
    ...EMPTY_LINKED_DATASET,
  },
  datasetV2: {
    datasetId: undefined,
    ...EMPTY_LINKED_DATASET_ROW,
  },
  history: { logUuid: undefined, inputs: {} },
}

function getDocState(oldState: InputsByDocument | null, key: string) {
  const state = oldState ?? {}
  const doc = state[key] ?? EMPTY_INPUTS
  return { state, doc }
}

function getValue({ paramValue }: { paramValue: unknown | undefined }) {
  try {
    const value =
      typeof paramValue === 'string' ? paramValue : JSON.stringify(paramValue)
    return { value, metadata: { includeInPrompt: paramValue !== undefined } }
  } catch {
    return { value: '', metadata: { includeInPrompt: false } }
  }
}

function mapLogParametersToInputs({
  inputs,
  parameters,
}: {
  inputs: Inputs<'history'>
  parameters: DocumentLog['parameters'] | undefined
}): Inputs<'history'> | undefined {
  const params = parameters ?? {}
  // No parameters
  if (!Object.keys(params).length) return undefined

  return Object.entries(inputs).reduce((acc, [key]) => {
    acc[key] = getValue({ paramValue: params[key] })
    return acc
  }, {} as Inputs<'history'>)
}

type InputsByDocument = Record<string, PlaygroundInputs<InputSource>>

// DEPRECATED: Remove after datasets V2 migration
function getLinkedDataset({
  document,
  localInputs,
}: {
  document: DocumentVersion
  localInputs: PlaygroundInputs<'dataset'>['dataset']
}) {
  const datasetId = document.datasetId
  if (!datasetId) return localInputs ?? EMPTY_LINKED_DATASET

  const all = document.linkedDataset ?? {}
  const isEmpty = Object.keys(all).length === 0

  if (isEmpty) {
    const legacyLocalData = localInputs
    return {
      rowIndex: legacyLocalData.rowIndex,
      inputs: legacyLocalData.inputs,
      mappedInputs: legacyLocalData.mappedInputs,
    }
  }

  return all[datasetId] ? all[datasetId] : (localInputs ?? EMPTY_LINKED_DATASET)
}

export function useDocumentParameters<
  V extends DatasetVersion = DatasetVersion,
>({
  document,
  commitVersionUuid,
  datasetVersion,
  isMountedOnRoot = false,
}: {
  document: DocumentVersion
  datasetVersion: V
  commitVersionUuid: string
  isMountedOnRoot?: boolean
}) {
  const { enabled: useDatasetsV2 } = useFeatureFlag({
    featureFlag: 'datasetsV2',
  })
  const { project } = useCurrentProject()
  const projectId = project.id
  const commitUuid = commitVersionUuid
  const { saveLinkedDataset } = useDocumentVersions({
    projectId,
    commitUuid,
  })
  // TODO: Delete stale inputs as new inputs could eventually not fit
  const { value: allInputs, setValue } = useLocalStorage<InputsByDocument>({
    key: AppLocalStorage.playgroundParameters,
    defaultValue: {},
  })
  const key = `${commitVersionUuid}:${document.documentUuid}`
  const inputs = allInputs[key] ?? EMPTY_INPUTS
  const source = inputs.source
  const linkedDataset = getLinkedDataset({
    document,
    localInputs: inputs.dataset,
  })

  const { asyncParameters, onParametersChange } = useAsyncDocumentParameters({
    isMountedOnRoot,
    source,
    inputs,
    datasetVersion,
    datasetV1Deprecated: linkedDataset,
  })

  const setInputs = useCallback(
    <S extends LocalInputSource>(source: S, newInputs: LocalInputs<S>) => {
      setValue((oldState) => {
        const { state, doc } = getDocState(oldState, key)

        const prevSource = doc[source]

        return {
          ...state,
          [key]: {
            ...doc,
            [source]: {
              ...prevSource,
              inputs: newInputs,
            },
          },
        }
      })
    },
    [allInputs, key, source, setValue],
  )

  const setManualInputs = useCallback(
    (newInputs: Inputs<'manual'>) => setInputs(INPUT_SOURCE.manual, newInputs),
    [setInputs],
  )

  const setHistoryInputs = useCallback(
    (newInputs: Inputs<'history'>) =>
      setInputs(INPUT_SOURCE.history, newInputs),
    [setInputs],
  )

  const setInput = useCallback(
    <S extends InputSource>(
      currentSource: S,
      value: PlaygroundInput<S>,
      param: string,
    ) => {
      switch (currentSource) {
        case INPUT_SOURCE.manual: {
          const prev = getLocalStorageInputsBySource({
            source: currentSource,
            inputs,
          })
          setManualInputs({ ...prev, [param]: value })
          break
        }
        case INPUT_SOURCE.history: {
          const prev = getLocalStorageInputsBySource({
            source: currentSource,
            inputs,
          })
          setHistoryInputs({ ...prev, [param]: value })
          break
        }
      }
    },
    [source, inputs, setInputs],
  )

  const setManualInput = useCallback(
    (param: string, value: PlaygroundInput<'manual'>) => {
      setInput(source, value, param)
    },
    [setInput],
  )

  const setHistoryInput = useCallback(
    (param: string, value: PlaygroundInput<'history'>) => {
      setInput(source, value, param)
    },
    [setInput, source],
  )

  const setSource = useCallback(
    (source: InputSource) => {
      setValue((prev) => {
        const { state, doc } = getDocState(prev, key)
        return {
          ...state,
          [key]: {
            ...doc,
            source,
          },
        }
      })
    },
    [key, setValue],
  )

  // TODO: Remove after a dataset V2 migration
  const copyDatasetInputsToManual = useCallback(() => {
    if (
      !linkedDataset ||
      !('inputs' in linkedDataset) ||
      !linkedDataset?.inputs
    ) {
      return
    }

    setManualInputs(linkedDataset.inputs)
  }, [linkedDataset?.inputs, inputs])

  const setHistoryLog = useCallback(
    (logUuid: string) => {
      setValue((old) => {
        const { state, doc } = getDocState(old, key)
        return {
          ...state,
          [key]: {
            ...doc,
            history: {
              ...doc.history,
              logUuid,
            },
          },
        }
      })
    },
    [allInputs, key, setValue],
  )

  const mapDocParametersToInputs = useCallback(
    ({ parameters }: { parameters: DocumentLog['parameters'] }) => {
      const state = allInputs[key]
      if (!state) return

      const docState = state.history
      const sourceInputs = docState.inputs
      const newInputs = mapLogParametersToInputs({
        inputs: sourceInputs,
        parameters,
      })

      if (!newInputs) return

      setInputs('history', newInputs)
    },
    [inputs, key, setInputs],
  )

  // TODO: Remove after a dataset V2 migration
  const setDataset = useCallback(
    async ({
      datasetId,
      datasetVersion,
      data,
    }: {
      datasetId: number
      data: LinkedDataset
      datasetVersion: DatasetVersion
    }) => {
      await saveLinkedDataset({
        projectId,
        commitUuid,
        documentUuid: document.documentUuid,
        datasetId,
        datasetVersion,
        inputs: data.inputs,
        mappedInputs: data.mappedInputs,
        rowIndex: data.rowIndex,
      })
    },
    [saveLinkedDataset, projectId, commitUuid, document.documentUuid],
  )

  const setDatasetMappedInputs = useCallback(
    ({
      datasetId,
      datasetRowId: nextDatasetRowId,
      mappedInputs: nextMappedInputs,
    }: {
      datasetId: number
      mappedInputs: LinkedDatasetRow['mappedInputs'] | undefined
      datasetRowId: number | undefined
    }) => {
      setValue((oldState) => {
        const { state, doc } = getDocState(oldState, key)
        const prevSource = doc['datasetV2'] ?? {
          datasetId,
          mappedInputs: nextMappedInputs ?? {},
          datasetRowId: nextDatasetRowId,
        }
        const mappedInputs = nextMappedInputs ?? prevSource.mappedInputs
        const datasetRowId = nextDatasetRowId ?? prevSource.datasetRowId

        return {
          ...state,
          [key]: {
            ...doc,
            datasetV2: {
              ...prevSource,
              mappedInputs,
              datasetRowId,
            },
          },
        }
      })
    },
    [allInputs, key, source, setValue],
  )

  const setDatasetV2 = useCallback(
    async ({
      datasetId,
      datasetVersion,
      data,
    }: {
      datasetId: number
      datasetVersion: DatasetVersion
      data: {
        mappedInputs?: LinkedDatasetRow['mappedInputs'] | undefined
        datasetRowId?: number | undefined
      }
    }) => {
      const { doc } = getDocState(allInputs, key)
      const datasetDoc = doc['datasetV2'] ?? {
        datasetId,
        mappedInputs: data.mappedInputs ?? {},
        datasetRowId: data.datasetRowId,
      }
      const prevDatasetRowId = datasetDoc.datasetRowId
      const prevMappedInputs = datasetDoc.mappedInputs

      // Optimistic update in local storage
      setDatasetMappedInputs({
        datasetId,
        mappedInputs: data.mappedInputs,
        datasetRowId: data.datasetRowId,
      })

      const [_, error] = await saveLinkedDataset({
        projectId,
        commitUuid,
        documentUuid: document.documentUuid,
        datasetId,
        datasetVersion,
        mappedInputs: data.mappedInputs,
        datasetRowId: data.datasetRowId,
      })

      if (error) {
        setDatasetMappedInputs({
          datasetId,
          mappedInputs: prevMappedInputs,
          datasetRowId: prevDatasetRowId,
        })
      }
    },
    [
      saveLinkedDataset,
      projectId,
      commitUuid,
      document.documentUuid,
      allInputs,
      key,
    ],
  )

  const onMetadataProcessed = useCallback(
    (metadata: ConversationMetadata) => {
      setInputs(
        'manual',
        recalculateInputs({
          inputs: inputs.manual.inputs,
          metadata,
        }),
      )

      // TODO: Remove after a dataset V2 migration
      // This is not needed with new datasets. We don't store the values
      // of the cells viewed because they can be modified now.
      if (datasetVersion === DatasetVersion.V1) {
        const datasetInputs = recalculateInputs<'dataset'>({
          inputs: linkedDataset.inputs,
          metadata,
        })
        // Store in local while not stored in the DB
        setInputs('dataset', datasetInputs)

        if (document.datasetId && linkedDataset) {
          setDataset({
            datasetId: document.datasetId,
            datasetVersion,
            data: {
              inputs: datasetInputs,
              mappedInputs: linkedDataset.mappedInputs,
              rowIndex: linkedDataset.rowIndex,
            } as LinkedDataset,
          })
        }
      }

      setInputs(
        'history',
        recalculateInputs({
          inputs: inputs.history.inputs,
          metadata,
        }),
      )
    },
    [
      inputs,
      setInputs,
      source,
      document.datasetId,
      linkedDataset,
      datasetVersion,
      useDatasetsV2,
    ],
  )

  return {
    onParametersChange,
    parameters: asyncParameters.parameters,
    setParametersLoading: asyncParameters.setLoading,
    parametersLoading: asyncParameters.loading,
    onMetadataProcessed,
    source,
    setSource,
    setInput,
    manual: {
      inputs: inputs['manual'].inputs,
      setInput: setManualInput,
      setInputs: setManualInputs,
    },
    dataset: {
      datasetId: document.datasetId,
      rowIndex:
        linkedDataset && 'rowIndex' in linkedDataset
          ? linkedDataset?.rowIndex
          : undefined,
      inputs: linkedDataset?.inputs,
      mappedInputs: linkedDataset?.mappedInputs,
      setDataset,
      copyToManual: copyDatasetInputsToManual,
    },
    datasetV2: {
      datasetRowId: document.datasetV2Id
        ? document.linkedDatasetAndRow?.[document.datasetV2Id]?.datasetRowId
        : undefined,
      setDataset: setDatasetV2,
    },
    history: {
      logUuid: inputs['history'].logUuid,
      inputs: inputs['history'].inputs,
      setInput: setHistoryInput,
      setInputs: setHistoryInputs,
      setHistoryLog,
      mapDocParametersToInputs,
    },
  }
}

export type UseDocumentParameters = ReturnType<typeof useDocumentParameters>
