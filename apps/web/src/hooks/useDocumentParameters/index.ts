import { useCallback, useMemo } from 'react'

import { AppLocalStorage, useLocalStorage } from '@latitude-data/web-ui'

function convertToParams(inputs: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(inputs).map(([key, value]) => {
      try {
        return [key, JSON.parse(value)]
      } catch (e) {
        return [key, value]
      }
    }),
  )
}

export type PlaygroundInputs = Record<string, string>
export function recalculateInputs({
  inputs,
  metadataParameters,
}: {
  inputs: PlaygroundInputs
  metadataParameters: Set<string>
}) {
  return Object.fromEntries(
    Array.from(metadataParameters).map((param) => {
      if (param in inputs) return [param, inputs[param]!]

      const availableInputKey = Object.keys(inputs).find(
        (key) => !metadataParameters.has(key),
      )
      if (availableInputKey) {
        return [param, inputs[availableInputKey] ?? '']
      }

      return [param, '']
    }),
  )
}

type InputsByCommitVersionAndDocumentUuid = Record<string, PlaygroundInputs>
export function useDocumentParameters({
  documentVersionUuid,
  commitVersionUuid,
}: {
  documentVersionUuid: string
  commitVersionUuid: string
}) {
  const { value: allInputs, setValue } =
    useLocalStorage<InputsByCommitVersionAndDocumentUuid>({
      key: AppLocalStorage.playgroundInputs,
      defaultValue: {},
    })
  const key = `${commitVersionUuid}:${documentVersionUuid}`
  const inputs = allInputs[key] || {}
  const parameters = useMemo(() => convertToParams(inputs), [inputs])

  const setInputs = useCallback(
    (newInputs: PlaygroundInputs) => {
      setValue((prev) => ({ ...prev, [key]: newInputs }))
    },
    [allInputs, key],
  )

  const onMetadataProcessed = useCallback(
    (metadataParameters: Set<string>) => {
      setInputs(recalculateInputs({ inputs, metadataParameters }))
    },
    [inputs],
  )

  return { parameters, inputs, setInputs, onMetadataProcessed }
}
