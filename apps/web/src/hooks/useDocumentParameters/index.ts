import { useCallback, useMemo, useRef } from 'react'

import { useDatasetUtils } from '$/hooks/useDocumentParameters/datasetUtils'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { useCurrentProject } from '$/app/providers/ProjectProvider'
import { detectParamChanges } from './detectParameterChanges'
import { useMetadataParameters } from './metadataParametersStore'
import {
  type InputsByDocument,
  EMPTY_INPUTS,
  getDocState,
  getInputsBySource,
  mapLogParametersToInputs,
  recalculateAllInputs,
  updateInputsState,
} from './utils'
import { type ResolvedMetadata } from '$/workers/readMetadata'
import { useEvents } from '$/lib/events'
import { DocumentLog, LogSources } from '@latitude-data/core/constants'

import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import {
  INPUT_SOURCE,
  Inputs,
  InputSource,
  PlaygroundInput,
} from '@latitude-data/core/lib/documentPersistedInputs'

function convertToParams(inputs: Inputs<InputSource>) {
  return Object.fromEntries(
    Object.entries(inputs).map(([key, input]) => {
      try {
        return [key, JSON.parse(input.value)]
      } catch (_e) {
        return [key, input?.value?.toString?.()]
      }
    }),
  )
}

// TODO: This hook is very complex, refactor it into smaller pieces
export function useDocumentParameters({
  document,
  commitVersionUuid,
}: {
  document: DocumentVersion
  commitVersionUuid: string
}) {
  const { metadataParameters, setParameters, emptyInputs } =
    useMetadataParameters()
  const { project } = useCurrentProject()
  const projectId = project.id
  const commitUuid = commitVersionUuid
  // TODO: Delete stale inputs as new inputs could eventually not fit
  const { value: allInputs, setValue } = useLocalStorage<InputsByDocument>({
    key: AppLocalStorage.playgroundParameters,
    defaultValue: {},
  })
  const key = `${commitVersionUuid}:${document.documentUuid}`
  const inputs = allInputs[key] ?? EMPTY_INPUTS
  const source = inputs.source
  const dsId = document.datasetV2Id
  const inputsBySource = getInputsBySource({
    source,
    inputs,
    datasetId: dsId,
    emptyInputs,
  })
  const { setDataset, isAssigning } = useDatasetUtils({
    key,
    projectId,
    commitUuid,
    document,
    allInputs,
    setValue,
  })

  const setManualInputs = useCallback(
    (newInputs: Inputs<'manual'>) => {
      setValue((old) =>
        updateInputsState({
          key,
          source: 'manual',
          oldState: old,
          newInputs,
        }),
      )
    },
    [setValue, key],
  )

  const setHistoryInputs = useCallback(
    (newInputs: Inputs<'history'>) =>
      setValue((old) =>
        updateInputsState({
          key,
          source: 'history',
          oldState: old,
          newInputs,
        }),
      ),
    [key, setValue],
  )

  const setInput = useCallback(
    <S extends InputSource>(
      currentSource: S,
      value: PlaygroundInput<S>,
      param: string,
    ) => {
      switch (currentSource) {
        case INPUT_SOURCE.manual: {
          setManualInputs({ ...inputsBySource, [param]: value })
          break
        }
        case INPUT_SOURCE.history: {
          setHistoryInputs({ ...inputsBySource, [param]: value })
          break
        }
      }
    },
    [inputsBySource, setHistoryInputs, setManualInputs],
  )

  const setManualInput = useCallback(
    (param: string, value: PlaygroundInput<'manual'>) => {
      setInput(source, value, param)
    },
    [setInput, source],
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

  const copyDatasetToManual = useCallback(() => {
    const dsInputs = dsId ? (inputs.datasetV2?.[dsId]?.inputs ?? {}) : {}
    setManualInputs(dsInputs)
  }, [inputs.datasetV2, dsId, setManualInputs])

  const setHistoryLog = useCallback(
    ({ uuid, source }: { uuid: string; source?: LogSources | null }) => {
      setValue((old) => {
        const { state, doc } = getDocState(old, key)
        return {
          ...state,
          [key]: {
            ...doc,
            history: {
              ...doc.history,
              logUuid: uuid,
              force: source !== LogSources.Playground,
            },
          },
        }
      })
    },
    [key, setValue],
  )

  const mapDocParametersToInputs = useCallback(
    ({ parameters }: { parameters: DocumentLog['parameters'] }) => {
      setValue((old) => {
        const { doc } = getDocState(old, key)
        const sourceInputs = doc.history.inputs
        const newInputs = mapLogParametersToInputs({
          emptyInputs: emptyInputs.history,
          inputs: sourceInputs,
          parameters,
        })

        if (!newInputs) return old

        return updateInputsState({
          key,
          source: 'history',
          oldState: old,
          newInputs,
        })
      })
    },
    [key, setValue, emptyInputs.history],
  )

  const onMetadataChange = useCallback(
    (metadata: ResolvedMetadata) => {
      setValue((oldState) => {
        const prevInputs = useMetadataParameters.getState().prevInputs
        return recalculateAllInputs({
          key,
          oldState,
          metadata,
          config: {
            manual: {
              fallbackInputs: prevInputs?.manual?.inputs,
            },
            history: {
              fallbackInputs: prevInputs?.history?.inputs,
            },
            datasetV2: {
              datasetId: dsId,
              fallbackInputs: dsId
                ? prevInputs?.datasetV2?.[dsId]?.inputs
                : undefined,
            },
          },
        })
      })
    },
    [key, setValue, dsId],
  )
  const lastMetadataRef = useRef<ResolvedMetadata | null>(null)
  const snapshotCurrentDoc = useCallback(() => {
    setValue((oldState) => {
      const { doc } = getDocState(oldState, key)
      useMetadataParameters.getState().setPrevInputs(doc)
      return oldState
    })
  }, [key, setValue])

  useEvents({
    onPromptMetadataChanged: ({ metadata }) => {
      if (!lastMetadataRef.current) {
        lastMetadataRef.current = metadata
      }

      const prevParams = lastMetadataRef.current.parameters
      const nextParams = metadata.parameters
      const { removed } = detectParamChanges(prevParams, nextParams)

      if (removed.length > 0) snapshotCurrentDoc()

      setParameters(Array.from(nextParams))
      onMetadataChange(metadata)

      lastMetadataRef.current = metadata
    },
  })

  const parameters = useMemo(() => {
    if (!metadataParameters) return undefined

    return convertToParams(inputsBySource)
  }, [inputsBySource, metadataParameters])

  return useMemo(
    () => ({
      metadataParameters,
      parameters,
      source,
      setSource,
      setInput,
      manual: {
        inputs: inputs['manual'].inputs,
        setInput: setManualInput,
        setInputs: setManualInputs,
      },
      datasetV2: {
        isAssigning,
        assignedDatasets: inputs.datasetV2 ?? {},
        datasetRowId: dsId
          ? inputs?.datasetV2?.[dsId]?.datasetRowId
          : undefined,
        inputs: dsId
          ? (inputs.datasetV2?.[dsId]?.inputs ?? emptyInputs.datasetV2)
          : emptyInputs.datasetV2,
        mappedInputs: dsId
          ? (inputs.datasetV2?.[dsId]?.mappedInputs ?? {})
          : {},
        setDataset,
        copyToManual: copyDatasetToManual,
      },
      history: {
        logUuid: inputs['history'].logUuid,
        inputs: inputs['history'].inputs,
        force: inputs['history'].force,
        setInput: setHistoryInput,
        setInputs: setHistoryInputs,
        setHistoryLog,
        mapDocParametersToInputs,
      },
    }),
    [
      metadataParameters,
      parameters,
      source,
      setSource,
      setInput,
      inputs,
      emptyInputs,
      setManualInput,
      setManualInputs,
      isAssigning,
      dsId,
      setDataset,
      copyDatasetToManual,
      setHistoryInput,
      setHistoryInputs,
      setHistoryLog,
      mapDocParametersToInputs,
    ],
  )
}

export type UseDocumentParameters = ReturnType<typeof useDocumentParameters>
