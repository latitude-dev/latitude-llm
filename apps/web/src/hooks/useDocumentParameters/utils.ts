import { uniq } from 'lodash-es'
import { ResolvedMetadata } from '$/workers/readMetadata'
import {
  INPUT_SOURCE,
  LinkedDataset,
  LinkedDatasetRow,
  Inputs,
  InputSource,
  DocumentLog,
  PlaygroundInputs,
} from '@latitude-data/core/browser'
import { recalculateInputs } from './recalculateInputs'
import { EmptyInputs } from '$/hooks/useDocumentParameters/metadataParametersStore'

export type InputsByDocument = Record<string, PlaygroundInputs<InputSource>>
const EMPTY_LINKED_DATASET = {
  rowIndex: 0,
  inputs: {} as LinkedDataset['inputs'],
  mappedInputs: {} as LinkedDataset['mappedInputs'],
}
export const EMPTY_INPUTS: PlaygroundInputs<'manual'> = {
  source: INPUT_SOURCE.manual,
  manual: { inputs: {} },
  dataset: {
    datasetId: undefined,
    ...EMPTY_LINKED_DATASET,
  },
  datasetV2: {},
  history: { logUuid: undefined, force: false, inputs: {} },
}

export function getDocState(oldState: InputsByDocument | null, key: string) {
  const state = oldState ?? {}
  const doc = state[key] ?? EMPTY_INPUTS
  return { state, doc }
}

export function getValue({ paramValue }: { paramValue: unknown | undefined }) {
  try {
    const value =
      typeof paramValue === 'string' ? paramValue : JSON.stringify(paramValue)
    return { value, metadata: { includeInPrompt: paramValue !== undefined } }
  } catch {
    return { value: '', metadata: { includeInPrompt: false } }
  }
}

export function mapLogParametersToInputs({
  inputs,
  parameters,
  emptyInputs,
}: {
  inputs: Inputs<'history'>
  emptyInputs: Inputs<'history'> | undefined
  parameters: DocumentLog['parameters'] | undefined
}): Inputs<'history'> | undefined {
  const params = parameters ?? {}

  // No parameters
  if (!Object.keys(params).length) return undefined

  const inputsKeys = Object.keys(inputs)
  const newInputsKeys = Object.keys(emptyInputs ?? {})
  const allKeys = uniq([...inputsKeys, ...newInputsKeys])
  return allKeys.reduce((acc, key) => {
    acc[key] = getValue({ paramValue: params[key] })
    return acc
  }, {} as Inputs<'history'>)
}

export function getInputsBySource<S extends InputSource>({
  source,
  inputs,
  datasetId,
  emptyInputs,
}: {
  source: S
  inputs: PlaygroundInputs<S>
  datasetId: number | null
  emptyInputs: EmptyInputs
}) {
  if (source === 'manual') return inputs.manual.inputs
  if (source === 'history') return inputs.history.inputs

  const emptyDatasetInputs = emptyInputs?.datasetV2 ?? {}
  if (!datasetId) return emptyDatasetInputs

  const datasetInputs = inputs.datasetV2?.[datasetId]?.inputs
  if (!datasetInputs) return emptyDatasetInputs

  return datasetInputs
}

export function updateInputsState<S extends InputSource>({
  key,
  source,
  oldState,
  newInputs,
}: {
  key: string
  source: S
  oldState: InputsByDocument | null
  newInputs: Inputs<S>
}) {
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
}

export function recalculateAllInputs({
  key,
  oldState,
  metadata,
  config,
}: {
  key: string
  oldState: InputsByDocument
  metadata: ResolvedMetadata
  config: {
    manual?: {
      fallbackInputs?: Inputs<'manual'>
    }
    history?: {
      fallbackInputs?: Inputs<'history'>
    }
    datasetV2?: {
      datasetId?: number | null
      fallbackInputs?: Inputs<'datasetV2'>
    }
  }
}) {
  const { doc } = getDocState(oldState, key)
  const newDoc = { ...doc }

  if (config.manual) {
    const inputs = doc.manual?.inputs ?? {}
    newDoc.manual = {
      ...doc.manual,
      inputs: recalculateInputs<'manual'>({
        inputs,
        fallbackInputs: config.manual.fallbackInputs,
        metadata,
      }),
    }
  }

  if (config.history) {
    const inputs = doc.history?.inputs ?? {}
    newDoc.history = {
      ...doc.history,
      inputs: recalculateInputs<'history'>({
        inputs,
        fallbackInputs: config.history.fallbackInputs,
        metadata,
      }),
      logUuid: doc.history?.logUuid, // preserve required prop
    }
  }

  let dsId = config.datasetV2?.datasetId
  dsId = dsId !== undefined && dsId !== null ? dsId : undefined
  const row = dsId ? doc.datasetV2?.[dsId] : undefined
  if (dsId && doc.datasetV2?.[dsId] && row?.datasetRowId) {
    const inputs = row.inputs ?? {}
    const updatedRow: LinkedDatasetRow = {
      datasetRowId: row.datasetRowId,
      mappedInputs: row.mappedInputs ?? {},
      inputs: recalculateInputs<'datasetV2'>({
        inputs,
        fallbackInputs: config.datasetV2?.fallbackInputs,
        metadata,
      }),
    }

    newDoc.datasetV2 = {
      ...doc.datasetV2,
      [dsId]: updatedRow,
    }
  }

  return {
    ...oldState,
    [key]: {
      ...doc,
      ...newDoc,
    },
  }
}
