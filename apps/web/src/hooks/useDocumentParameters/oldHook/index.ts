import { useCallback, useMemo } from 'react'

import { AppLocalStorage, useLocalStorage } from '@latitude-data/web-ui'
import { useFeatureFlag } from '$/hooks/useFeatureFlag'

function convertToParams(
  inputs: PlaygroundInputs,
  newParams: boolean | undefined,
) {
  return Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => {
      const input =
        typeof value === 'string' && newParams
          ? { value, includedInPrompt: true }
          : value
      try {
        return [
          key,
          JSON.parse(typeof input === 'string' ? input : input.value),
        ]
      } catch (e) {
        return [key, typeof input === 'string' ? input : input.value]
      }
    }),
  )
}

export type PlaygroundInput =
  | { value: string; includedInPrompt: boolean }
  | string
export type PlaygroundInputs = Record<string, PlaygroundInput>
function convertInput(
  input: PlaygroundInput | undefined,
  newParams: boolean | undefined,
): PlaygroundInput {
  if (!input && newParams) return { value: '', includedInPrompt: true }
  if (!input) return ''

  if (typeof input === 'string' && newParams) {
    return { value: input, includedInPrompt: true }
  }

  if (!newParams) return input

  return {
    value: typeof input === 'string' ? input : input.value,
    includedInPrompt: typeof input === 'string' ? true : input.includedInPrompt,
  }
}

export function recalculateInputs({
  inputs,
  metadataParameters,
  newParams,
}: {
  inputs: PlaygroundInputs
  metadataParameters: Set<string>
  newParams: boolean | undefined
}) {
  return Object.fromEntries(
    Array.from(metadataParameters).map((param) => {
      if (param in inputs) {
        return [param, convertInput(inputs[param], newParams)]
      }

      const availableInputKey = Object.keys(inputs).find(
        (key) => !metadataParameters.has(key),
      )
      if (availableInputKey) {
        return [param, convertInput(inputs[availableInputKey], newParams)]
      }

      return [param, { value: '', includedInPrompt: true }]
    }),
  )
}

// TODO: Remove after new params has being in producting
// for at least 3 months.
// This is here because before we stored the inputs as a string
// now we store them as { value: string; includedInPrompt: boolean }
// To show this informating in params editor
function convertToNewInputsInputs(
  oldInputs: PlaygroundInputs,
  newParams: boolean | undefined,
) {
  if (!newParams) return oldInputs

  return Object.fromEntries(
    Object.entries(oldInputs).map(([key, value]) => {
      return [
        key,
        typeof value === 'string' ? { value, includedInPrompt: true } : value,
      ]
    }),
  ) as PlaygroundInputs
}

type InputsByCommitVersionAndDocumentUuid = Record<string, PlaygroundInputs>
export function useDocumentParameters({
  documentVersionUuid,
  commitVersionUuid,
}: {
  documentVersionUuid: string
  commitVersionUuid: string
}) {
  // FIXME: Remove after new params is fully implemented
  const newParams = useFeatureFlag()
  const { value: allInputs, setValue } =
    useLocalStorage<InputsByCommitVersionAndDocumentUuid>({
      key: AppLocalStorage.playgroundInputs,
      defaultValue: {},
    })
  const key = `${commitVersionUuid}:${documentVersionUuid}`
  const inputs = useMemo(
    () => convertToNewInputsInputs(allInputs[key] ?? {}, newParams),
    [allInputs, key, newParams],
  )
  const parameters = useMemo(() => convertToParams(inputs, newParams), [inputs])

  const setInputs = useCallback(
    (newInputs: PlaygroundInputs) => {
      setValue((prev) => ({ ...prev, [key]: newInputs }))
    },
    [allInputs, key],
  )

  const onMetadataProcessed = useCallback(
    (metadataParameters: Set<string>) => {
      const newInputs = recalculateInputs({
        inputs,
        metadataParameters,
        newParams,
      })

      setInputs(newInputs)
    },
    [inputs, newParams, setInputs],
  )

  return { parameters, inputs, setInputs, onMetadataProcessed }
}
