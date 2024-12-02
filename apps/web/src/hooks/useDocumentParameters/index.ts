import { useCallback, useMemo } from 'react'

import { DocumentLog } from '@latitude-data/core/browser'
import { AppLocalStorage, useLocalStorage } from '@latitude-data/web-ui'
import { recalculateInputs } from '$/hooks/useDocumentParameters/recalculateInputs'

export const INPUT_SOURCE = {
  manual: 'manual',
  dataset: 'dataset',
  history: 'history',
} as const

export type InputSource = (typeof INPUT_SOURCE)[keyof typeof INPUT_SOURCE]
export type PlaygroundInput<S extends InputSource> = S extends 'dataset'
  ? {
      value: string
      metadata: { includeInPrompt: boolean }
    }
  : {
      value: string
      metadata: { includeInPrompt?: boolean }
    }

type ManualInput = PlaygroundInput<'manual'>
type DatasetInput = PlaygroundInput<'dataset'>
type HistoryInput = PlaygroundInput<'history'>

export type Inputs<S extends InputSource> = Record<string, PlaygroundInput<S>>

export type PlaygroundInputs<S extends InputSource> = {
  source: S
  manual: {
    inputs: Record<string, ManualInput>
  }
  dataset: {
    datasetId: number | undefined
    rowIndex: number | undefined
    inputs: Record<string, DatasetInput>
    mappedInputs: Record<string, number>
  }
  history: {
    logUuid: string | undefined
    inputs: Record<string, HistoryInput>
  }
}

export type DatasetSource = Omit<
  PlaygroundInputs<'dataset'>['dataset'],
  'inputs'
>
const EMPTY_INPUTS: PlaygroundInputs<'manual'> = {
  source: INPUT_SOURCE.manual,
  manual: { inputs: {} },
  dataset: {
    datasetId: undefined,
    rowIndex: undefined,
    inputs: {},
    mappedInputs: {},
  },
  history: { logUuid: undefined, inputs: {} },
}

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
export function useDocumentParameters({
  documentVersionUuid,
  commitVersionUuid,
}: {
  documentVersionUuid: string
  commitVersionUuid: string
}) {
  const { value: allInputs, setValue } = useLocalStorage<InputsByDocument>({
    key: AppLocalStorage.playgroundParameters,
    defaultValue: {},
  })
  const key = `${commitVersionUuid}:${documentVersionUuid}`
  const inputs = allInputs[key] ?? EMPTY_INPUTS
  const source = inputs.source
  const inputsBySource = inputs[source].inputs

  const setInputs = useCallback(
    <S extends InputSource>(source: S, newInputs: Inputs<S>) => {
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

  const setDatasetInputs = useCallback(
    (newInputs: Inputs<'dataset'>) =>
      setInputs(INPUT_SOURCE.dataset, newInputs),
    [setInputs],
  )
  const setHistoryInputs = useCallback(
    (newInputs: Inputs<'history'>) =>
      setInputs(INPUT_SOURCE.history, newInputs),
    [setInputs],
  )

  const setInput = useCallback(
    <S extends InputSource>(
      source: S,
      value: PlaygroundInput<S>,
      param: string,
    ) => {
      inputs
      switch (source) {
        case INPUT_SOURCE.manual:
          setManualInputs({ ...inputsBySource, [param]: value })
          break
        case INPUT_SOURCE.history:
          setHistoryInputs({ ...inputsBySource, [param]: value })
          break
        case INPUT_SOURCE.dataset:
          setDatasetInputs({
            ...(inputsBySource as unknown as Inputs<'dataset'>),
            [param]: value as PlaygroundInput<'dataset'>,
          })
          break
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

  const setDatasetInput = useCallback(
    (param: string, value: PlaygroundInput<'dataset'>) => {
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

  const setDataset = useCallback(
    (selected: DatasetSource) => {
      setValue((old) => {
        const { state, doc } = getDocState(old, key)
        return {
          ...state,
          [key]: {
            ...doc,
            dataset: {
              ...doc.dataset,
              ...selected,
            },
          },
        }
      })
    },
    [allInputs, key, setValue],
  )

  const copyDatasetInputsToManual = useCallback(() => {
    setManualInputs(inputs['dataset'].inputs)
  }, [inputs])

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
    ({
      parameters,
      source,
    }: {
      parameters: DocumentLog['parameters']
      source: InputSource
    }) => {
      const state = allInputs[key]
      if (!state) return

      const docState = state[source]
      const sourceInputs = docState.inputs
      const newInputs = mapLogParametersToInputs({
        inputs: sourceInputs,
        parameters,
      })
      if (!newInputs) return

      setInputs(source, newInputs)
    },
    [inputs, key, setInputs],
  )

  const onMetadataProcessed = useCallback(
    (metadataParameters: Set<string>) => {
      setInputs(
        'manual',
        recalculateInputs({ inputs: inputs.manual.inputs, metadataParameters }),
      )
      setInputs(
        'dataset',
        recalculateInputs({
          inputs: inputs.dataset.inputs,
          metadataParameters,
        }),
      )
      setInputs(
        'history',
        recalculateInputs({
          inputs: inputs.history.inputs,
          metadataParameters,
        }),
      )
    },
    [inputs, setInputs, source],
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
    mapDocParametersToInputs,
    manual: {
      inputs: inputs['manual'].inputs,
      setInput: setManualInput,
      setInputs: setManualInputs,
    },
    dataset: {
      datasetId: inputs['dataset'].datasetId,
      rowIndex: inputs['dataset'].rowIndex,
      inputs: inputs['dataset'].inputs,
      mappedInputs: inputs['dataset'].mappedInputs,
      setInput: setDatasetInput,
      setInputs: setDatasetInputs,
      copyToManual: copyDatasetInputsToManual,
      setDataset,
    },
    history: {
      logUuid: inputs['history'].logUuid,
      inputs: inputs['history'].inputs,
      setInput: setHistoryInput,
      setInputs: setHistoryInputs,
      setHistoryLog,
    },
  }
}
