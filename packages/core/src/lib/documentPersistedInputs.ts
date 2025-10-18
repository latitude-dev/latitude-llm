import { ParameterType } from '@latitude-data/constants'

export const INPUT_SOURCE = {
  manual: 'manual',
  dataset: 'dataset',
  datasetV2: 'datasetV2',
  history: 'history',
} as const
const _LOCAL_INPUT_SOURCE = {
  manual: 'manual',
  history: 'history',
  dataset: 'dataset',
  datasetV2: 'datasetV2',
} as const
export type LocalInputSource =
  (typeof _LOCAL_INPUT_SOURCE)[keyof typeof _LOCAL_INPUT_SOURCE]

export type InputSource = (typeof INPUT_SOURCE)[keyof typeof INPUT_SOURCE]
type PlaygroundInputMetadata = {
  type?: ParameterType
  includeInPrompt?: boolean
}

type LocalPlaygroundInput<_S extends LocalInputSource = 'manual'> = {
  value: string
  metadata: PlaygroundInputMetadata
}
export type PlaygroundInput<S extends Omit<InputSource, 'datasetV2'>> =
  S extends 'dataset'
    ? {
        value: string
        metadata: PlaygroundInputMetadata & { includeInPrompt: boolean }
      }
    : S extends 'datasetV2'
      ? {
          value: string
          metadata: PlaygroundInputMetadata & { includeInPrompt: boolean }
        }
      : LocalPlaygroundInput<LocalInputSource>

type ManualInput = PlaygroundInput<'manual'>
type DatasetInput = PlaygroundInput<'dataset'>
type HistoryInput = PlaygroundInput<'history'>

export type Inputs<S extends InputSource> = Record<string, PlaygroundInput<S>>
export type LocalInputs<S extends LocalInputSource> = Record<
  string,
  LocalPlaygroundInput<S>
>

export type LinkedDataset = {
  rowIndex: number | undefined
  inputs: Record<string, DatasetInput>
  mappedInputs: Record<string, number>
}

export type LinkedDatasetRow = {
  datasetRowId: number
  inputs: Record<string, DatasetInput>
  mappedInputs: Record<string, string>
}

export type PlaygroundInputs<S extends InputSource> = {
  source: S
  manual: {
    inputs: Record<string, ManualInput>
  }
  // DEPRECATED: Remove after a while
  dataset: LinkedDataset & { datasetId: number | undefined }
  datasetV2: Record<number, LinkedDatasetRow> | undefined
  history: {
    logUuid: string | undefined
    inputs: Record<string, HistoryInput>
    force: boolean | undefined
  }
}
