import {
  DatasetVersion,
  INPUT_SOURCE,
  Inputs,
  InputSource,
  LinkedDataset,
  PlaygroundInputs,
} from '@latitude-data/core/browser'
import { useCallback, useEffect } from 'react'
import { create as createZustandStore } from 'zustand'

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

type AsyncDocumentParametersState = {
  parameters: { [key: string]: unknown }
  parametersLoading: boolean
  setLoading: () => void
  setParameters: (parameters: { [key: string]: unknown }) => void
  resetParameters: () => void
}

export const useAsyncDocumentParametersStore =
  createZustandStore<AsyncDocumentParametersState>((set) => ({
    parametersLoading: false,
    parameters: {},
    setLoading: () => {
      set({ parametersLoading: true })
    },
    resetParameters: () => {
      set({ parameters: {} })
    },
    setParameters: (parameters: { [key: string]: unknown }) => {
      set((state) => {
        return {
          parameters: {
            ...state.parameters,
            ...parameters,
          },
        }
      })

      set({ parametersLoading: false })
    },
  }))

export function getLocalStorageInputsBySource({
  source,
  inputs,
  linkedDataset,
}: {
  source: Omit<InputSource, 'datasetV2'>
  inputs: PlaygroundInputs<InputSource>
  linkedDataset?: LinkedDataset | undefined
}) {
  if (source === INPUT_SOURCE.manual) return inputs.manual.inputs
  if (source === INPUT_SOURCE.history) return inputs.history.inputs

  return linkedDataset?.inputs
}

export function useAsyncDocumentParameters({
  isMountedOnRoot,
  source,
  inputs,
  datasetVersion,
  datasetV1Deprecated,
}: {
  source: InputSource
  inputs: PlaygroundInputs<InputSource>
  isMountedOnRoot: boolean
  datasetV1Deprecated: LinkedDataset | undefined
  datasetVersion: DatasetVersion | undefined
}) {
  const asyncParameters = useAsyncDocumentParametersStore((state) => ({
    parameters: state.parameters,
    set: state.setParameters,
    reset: state.resetParameters,
    loading: state.parametersLoading,
    setLoading: state.setLoading,
  }))

  const localInputs = getLocalStorageInputsBySource({
    source,
    inputs,
    linkedDataset: datasetV1Deprecated,
  })
  // Set parameters for sources that are in localStorage
  useEffect(() => {
    if (!datasetVersion) return
    if (datasetVersion === DatasetVersion.V2) return

    if (localInputs) {
      const newLocalInputs = convertToParams(localInputs)
      asyncParameters.set(newLocalInputs)
    }
  }, [localInputs, datasetVersion, asyncParameters.set])

  // Set async loading state for
  useEffect(() => {
    if (!isMountedOnRoot) return
    if (!datasetVersion) return

    if (
      source === INPUT_SOURCE.dataset &&
      datasetVersion === DatasetVersion.V2
    ) {
      asyncParameters.setLoading()
    }

    return () => {
      // Clean this local state when navigation away from the document
      asyncParameters.reset()
    }
  }, [
    source,
    asyncParameters.setLoading,
    datasetVersion,
    isMountedOnRoot,
    asyncParameters.reset,
  ])

  const onParametersChange = useCallback(
    (parameters: { [key: string]: string }) => {
      asyncParameters.set(parameters)
    },
    [asyncParameters.set],
  )

  return { asyncParameters, onParametersChange }
}
