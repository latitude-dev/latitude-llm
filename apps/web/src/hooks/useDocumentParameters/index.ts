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

const EMPTY_INPUTS: PlaygroundInputs<'manual'> = {
  source: INPUT_SOURCE.manual,
  manual: { inputs: {} },
  dataset: {
    datasetId: undefined,
    ...EMPTY_LINKED_DATASET,
  },
  datasetV2: {},
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
  const { saveLinkedDataset, assignDataset } = useDocumentVersions({
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
  const dsId = document.datasetV2Id
  let inputsBySource =
    source === INPUT_SOURCE.dataset
      ? linkedDataset.inputs
      : source === INPUT_SOURCE.datasetV2
        ? dsId
          ? (inputs.datasetV2?.[dsId]?.inputs ?? {})
          : {}
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
    const dsInputs = dsId ? (inputs.datasetV2?.[dsId]?.inputs ?? {}) : {}
    setManualInputs(dsInputs)
  }, [inputs.datasetV2, dsId])

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

      saveLinkedDataset({
        projectId,
        commitUuid,
        documentUuid: document.documentUuid,
        datasetId,
        datasetVersion,
        datasetRowId: data?.datasetRowId,
        mappedInputs: data?.mappedInputs ?? {},
        inputs: data?.inputs ?? {},
      }).then(([_, error]) => {
        if (error) {
          setDatasetMappedInputs({
            datasetId,
            inputs: prevInputs,
            mappedInputs: prevMappedInputs,
            datasetRowId: prevDatasetRowId,
          })
        }
      })
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

  const onMetadataProcessed = useCallback(
    (metadata: ConversationMetadata) => {
      setInputs(
        'manual',
        recalculateInputs({
          inputs: inputs.manual.inputs,
          metadata,
        }),
      )

      if (datasetVersion === DatasetVersion.V2) {
        const dsId = document.datasetV2Id
        const rowId = dsId ? inputs.datasetV2?.[dsId]?.datasetRowId : undefined
        const dsInputs = dsId ? (inputs.datasetV2?.[dsId]?.inputs ?? {}) : {}
        const dsMappedInputs = dsId
          ? (inputs.datasetV2?.[dsId]?.mappedInputs ?? {})
          : {}
        const datasetInputs = recalculateInputs<'datasetV2'>({
          inputs: dsInputs,
          metadata,
        })
        // set data from metadata in localStorage
        setInputs('datasetV2', datasetInputs)

        if (dsId && rowId !== undefined) {
          setDatasetV2({
            datasetId: dsId,
            datasetVersion,
            data: {
              inputs: datasetInputs,
              mappedInputs: dsMappedInputs,
              datasetRowId: rowId,
            },
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
      assignedDatasets: inputs.datasetV2,
      datasetRowId: dsId ? inputs?.datasetV2?.[dsId]?.datasetRowId : undefined,
      inputs: dsId ? (inputs.datasetV2?.[dsId]?.inputs ?? {}) : {},
      mappedInputs: dsId ? (inputs.datasetV2?.[dsId]?.mappedInputs ?? {}) : {},
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
