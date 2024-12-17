import { ParameterType } from '../constants'

export const INPUT_SOURCE = {
  manual: 'manual',
  dataset: 'dataset',
  history: 'history',
} as const

export type InputSource = (typeof INPUT_SOURCE)[keyof typeof INPUT_SOURCE]
type PlaygroundInputMetadata = {
  type?: ParameterType
  filename?: string
  includeInPrompt?: boolean
}

export type PlaygroundInput<S extends InputSource> = S extends 'dataset'
  ? {
      value: string
      metadata: PlaygroundInputMetadata & { includeInPrompt: boolean }
    }
  : {
      value: string
      metadata: PlaygroundInputMetadata
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

export type LinkedDataset = Omit<
  PlaygroundInputs<'dataset'>['dataset'],
  'datasetId'
>

export type DatasetSource = Omit<
  PlaygroundInputs<'dataset'>['dataset'],
  'inputs'
>
