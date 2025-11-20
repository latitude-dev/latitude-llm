import { useCallback, useMemo } from 'react'
import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { useMetadataParameters } from './metadataParametersStore'
import { type InputsByDocument, EMPTY_INPUTS, updateInputsState } from './utils'
import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
import {
  Inputs,
  PlaygroundInput,
} from '@latitude-data/core/lib/documentPersistedInputs'

/**
 * Simplified hook for managing history parameters only.
 * Used in HistoryLogParams component where we only need to manage
 * parameter inputs without the full complexity of source switching,
 * dataset management, etc.
 */
export function useHistoryParameters({
  document,
  commitVersionUuid,
}: {
  document: DocumentVersion
  commitVersionUuid: string
}) {
  const { metadataParameters } = useMetadataParameters()
  const { value: allInputs, setValue } = useLocalStorage<InputsByDocument>({
    key: AppLocalStorage.playgroundParameters,
    defaultValue: {},
  })

  const key = `${commitVersionUuid}:${document.documentUuid}`
  const inputs = allInputs[key] ?? EMPTY_INPUTS
  const historyInputs = inputs.history.inputs

  const setHistoryInputs = useCallback(
    (
      newInputs:
        | Inputs<'history'>
        | ((prev: Inputs<'history'>) => Inputs<'history'>),
    ) => {
      setValue((old) => {
        const resolvedInputs =
          typeof newInputs === 'function'
            ? newInputs(
                old?.[key]?.history?.inputs ?? EMPTY_INPUTS.history.inputs,
              )
            : newInputs
        return updateInputsState({
          key,
          source: 'history',
          oldState: old,
          newInputs: resolvedInputs,
        })
      })
    },
    [key, setValue],
  )

  const setInput = useCallback(
    (param: string, value: PlaygroundInput<'history'>) => {
      setHistoryInputs((prevInputs) => ({ ...prevInputs, [param]: value }))
    },
    [setHistoryInputs],
  )

  return useMemo(
    () => ({
      inputs: historyInputs,
      setInput,
      metadataParameters,
    }),
    [historyInputs, setInput, metadataParameters],
  )
}

export type UseHistoryParameters = ReturnType<typeof useHistoryParameters>
