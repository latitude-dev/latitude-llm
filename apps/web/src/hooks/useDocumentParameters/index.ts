import { useCallback, useMemo } from 'react'

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
import { useFeatureFlag } from '$/components/Providers/FeatureFlags'

const EMPTY_LINKED_DATASET = {
  rowIndex: 0,
  inputs: {} as LinkedDataset['inputs'],
  mappedInputs: {} as LinkedDataset['mappedInputs'],
}

const EMPTY_LINKED_DATASET_ROW: LinkedDatasetRow = {
  datasetRowId: undefined,
  inputs: {} as LinkedDatasetRow['inputs'],
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

function convertToParams(inputs: Inputs<InputSource>) {
  return Object.fromEntries(
    Object.entries(inputs).map(([key, input]) => {
      try {
        return [key, JSON.parse(input.value)]
      } catch (e) {
        return [key, input?.value?.toString?.()]
      }
    }),
  )
}

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

function getLinkedDatasetV2({
  document,
  localInputs,
}: {
  document: DocumentVersion
  localInputs: PlaygroundInputs<'datasetV2'>['datasetV2']
}) {
  const datasetId = document.datasetV2Id
  if (!datasetId) return EMPTY_LINKED_DATASET_ROW

  const local = localInputs ?? EMPTY_LINKED_DATASET_ROW

  const all = document.linkedDatasetAndRow ?? {}
  const isEmpty = Object.keys(all).length === 0

  if (isEmpty) {
    return {
      datasetRowId: local.datasetRowId,
      inputs: local.inputs,
      mappedInputs: local.mappedInputs,
    }
  }

  return all[datasetId]
    ? {
        ...EMPTY_LINKED_DATASET_ROW,
        ...local,
        ...all[datasetId],
      }
    : {
        datasetRowId: local.datasetRowId,
        inputs: local.inputs,
        mappedInputs: local.mappedInputs,
      }
}

export function useDocumentParameters<
  V extends DatasetVersion = DatasetVersion,
>({
  document,
  commitVersionUuid,
  datasetVersion,
}: {
  document: DocumentVersion
  datasetVersion: V
  commitVersionUuid: string
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
  const linkedDatasetV2 = getLinkedDatasetV2({
    document,
    localInputs: inputs.datasetV2,
  })

  let inputsBySource =
    source === INPUT_SOURCE.dataset
      ? linkedDataset.inputs
      : source === INPUT_SOURCE.datasetV2
        ? linkedDatasetV2.inputs
        : inputs[source].inputs

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
      const prev = inputsBySource[currentSource] ?? {}
      switch (currentSource) {
        case INPUT_SOURCE.manual: {
          setManualInputs({ ...prev, [param]: value })
          break
        }
        case INPUT_SOURCE.history: {
          setHistoryInputs({ ...prev, [param]: value })
          break
        }
      }
    },
    [source, inputsBySource, setInputs],
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

  const copyDatasetV2InputsToManual = useCallback(() => {
    if (
      !linkedDatasetV2 ||
      !('inputs' in linkedDatasetV2) ||
      !linkedDataset?.inputs
    ) {
      return
    }

    setManualInputs(linkedDataset.inputs)
  }, [linkedDatasetV2?.inputs, inputs])

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
      inputs: nextInputs,
      mappedInputs: nextMappedInputs,
    }: {
      datasetId: number
      inputs: LinkedDatasetRow['inputs'] | undefined
      mappedInputs: LinkedDatasetRow['mappedInputs'] | undefined
      datasetRowId: number | undefined
    }) => {
      setValue((oldState) => {
        const { state, doc } = getDocState(oldState, key)
        const prevSource = doc['datasetV2'] ?? {
          datasetId,
          inputs: nextInputs ?? {},
          mappedInputs: nextMappedInputs ?? {},
          datasetRowId: nextDatasetRowId,
        }
        const datasetRowId = nextDatasetRowId ?? prevSource.datasetRowId
        const mappedInputs = nextMappedInputs ?? prevSource.mappedInputs
        const inputs = nextInputs ?? prevSource.inputs

        return {
          ...state,
          [key]: {
            ...doc,
            datasetV2: {
              ...prevSource,
              inputs,
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
      data?: {
        datasetRowId: number
        mappedInputs: LinkedDatasetRow['mappedInputs']
        inputs: LinkedDatasetRow['inputs']
      }
    }) => {
      const { doc } = getDocState(allInputs, key)
      const datasetDoc = doc['datasetV2'] ?? {
        datasetId,
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
        inputs: data?.inputs,
        mappedInputs: data?.mappedInputs,
        datasetRowId: data?.datasetRowId,
      })

      const [_, error] = await saveLinkedDataset({
        projectId,
        commitUuid,
        documentUuid: document.documentUuid,
        datasetId,
        datasetVersion,
        mappedInputs: data?.mappedInputs,
        datasetRowId: data?.datasetRowId,
        inputs: data?.inputs,
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

      if (datasetVersion === DatasetVersion.V2) {
        const datasetInputs = recalculateInputs<'datasetV2'>({
          inputs: linkedDatasetV2.inputs,
          metadata,
        })
        // Store in local while not stored in the DB
        setInputs('datasetV2', datasetInputs)

        if (document.datasetV2Id && linkedDatasetV2) {
          setDatasetV2({
            datasetId: document.datasetV2Id,
            datasetVersion,
            data: {
              inputs: datasetInputs,
              mappedInputs: linkedDatasetV2.mappedInputs,
              datasetRowId: linkedDatasetV2.datasetRowId,
            } as LinkedDatasetRow,
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
      linkedDatasetV2,
      setDatasetV2,
      datasetVersion,
      useDatasetsV2,
    ],
  )

  const parameters = useMemo(
    () => convertToParams(inputsBySource),
    [inputsBySource],
  )

  return {
    parameters,
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
      inputs: linkedDatasetV2.inputs,
      mappedInputs: linkedDatasetV2.mappedInputs,
      setDataset: setDatasetV2,
      copyToManual: copyDatasetV2InputsToManual,
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
