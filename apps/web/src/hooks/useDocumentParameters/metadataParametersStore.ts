import { create } from 'zustand'
import { ParameterType } from '@latitude-data/constants'
import {
  InputSource,
  PlaygroundInput,
  PlaygroundInputs,
} from '@latitude-data/core/lib/documentPersistedInputs'

export function buildEmptyInputsFromParameters<S extends InputSource>(
  parameters: string[],
): Record<string, PlaygroundInput<S>> {
  return Object.fromEntries(
    parameters.map((param) => [
      param,
      {
        value: '',
        metadata: {
          type: ParameterType.Text,
          includeInPrompt: false,
        },
      } as PlaygroundInput<S>,
    ]),
  )
}

export type EmptyInputs = {
  manual: Record<string, PlaygroundInput<'manual'>>
  datasetV2: Record<string, PlaygroundInput<'datasetV2'>>
  history: Record<string, PlaygroundInput<'history'>>
}
export type MetadataParameterState = {
  metadataParameters: string[] | undefined
  prevInputs: PlaygroundInputs<InputSource> | null
  emptyInputs: EmptyInputs
  setParameters: (params: string[]) => void
  setPrevInputs: (inputs: PlaygroundInputs<InputSource>) => void
}

export const useMetadataParameters = create<MetadataParameterState>((set) => ({
  metadataParameters: undefined,
  emptyInputs: {} as EmptyInputs,
  prevInputs: null,
  setParameters: (params) => {
    set({
      metadataParameters: params,
      emptyInputs: {
        manual: buildEmptyInputsFromParameters<'manual'>(params),
        history: buildEmptyInputsFromParameters<'history'>(params),
        datasetV2: buildEmptyInputsFromParameters<'datasetV2'>(params),
      },
    })
  },
  setPrevInputs: (inputs) => set({ prevInputs: inputs }),
}))
