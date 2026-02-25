'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  ReactNode,
} from 'react'
import {
  InputSource,
  INPUT_SOURCE,
} from '@latitude-data/core/lib/documentPersistedInputs'
import { ParameterType } from '@latitude-data/constants'
import { useParametersPersistence } from '$/hooks/useParametersPersistence'

export type DocumentParameterValues = {
  manual: Record<string, string>
  dataset: Record<string, string>
  datasetV2: Record<string, string>
  history: Record<string, string>
}

export type DocumentParameterTypes = {
  manual: Record<string, ParameterType>
  dataset: Record<string, ParameterType>
  datasetV2: Record<string, ParameterType>
  history: Record<string, ParameterType>
}

interface DocumentParametersContextType {
  values: DocumentParameterValues
  setParameterValue: (source: InputSource, param: string, value: string) => void
  setParameterValues: (
    source: InputSource,
    params: Record<string, string>,
  ) => void
  setParameterType: (
    source: InputSource,
    param: string,
    type: ParameterType,
  ) => void
  getSourceValues: (source: InputSource) => Record<string, string>
  getParameterType: (source: InputSource, param: string) => ParameterType
  currentSource: InputSource | undefined
  setCurrentSource: (source: InputSource) => void
  selectedDatasetId: number | undefined
  setSelectedDatasetId: (id: number | undefined) => void
  getStoredManualValue: (param: string) => string | undefined
  getStoredManualType: (param: string) => ParameterType | undefined
  isStorageLoaded: boolean
}

const DocumentParametersContext = createContext<
  DocumentParametersContextType | undefined
>(undefined)

export function DocumentParametersProvider({
  documentUuid,
  children,
}: {
  documentUuid: string
  children: ReactNode
}) {
  const [values, setValues] = useState<DocumentParameterValues>({
    manual: {},
    dataset: {},
    datasetV2: {},
    history: {},
  })
  const [types, setTypes] = useState<DocumentParameterTypes>({
    manual: {},
    dataset: {},
    datasetV2: {},
    history: {},
  })
  const [currentSource, setCurrentSource] = useState<InputSource | undefined>(
    undefined,
  )
  const [selectedDatasetId, setSelectedDatasetId] = useState<
    number | undefined
  >(undefined)

  const {
    storedParams,
    isLoaded: isStorageLoaded,
    updateParameter: persistParameter,
  } = useParametersPersistence(documentUuid)

  const setParameterValue = useCallback(
    (source: InputSource, param: string, value: string) => {
      setValues((prev) => ({
        ...prev,
        [source]: {
          ...prev[source],
          [param]: value,
        },
      }))

      // Persist manual params to IndexedDB
      if (source === INPUT_SOURCE.manual) {
        const currentType = types[source]?.[param] ?? ParameterType.Text
        persistParameter(param, value, currentType)
      }
    },
    [persistParameter, types],
  )

  const setParameterValues = useCallback(
    (source: InputSource, params: Record<string, string>) => {
      setValues((prev) => ({
        ...prev,
        [source]: {
          ...prev[source],
          ...params,
        },
      }))
    },
    [],
  )

  const setParameterType = useCallback(
    (source: InputSource, param: string, type: ParameterType) => {
      setTypes((prev) => ({
        ...prev,
        [source]: {
          ...prev[source],
          [param]: type,
        },
      }))

      // Persist manual param types to IndexedDB
      if (source === INPUT_SOURCE.manual) {
        const currentValue = values[source]?.[param] ?? ''
        persistParameter(param, currentValue, type)
      }
    },
    [persistParameter, values],
  )

  const getSourceValues = useCallback(
    (source: InputSource) => values[source],
    [values],
  )

  const getParameterType = useCallback(
    (source: InputSource, param: string) =>
      types[source]?.[param] ?? ParameterType.Text,
    [types],
  )

  // Get stored value from IndexedDB for a manual param
  const getStoredManualValue = useCallback(
    (param: string): string | undefined => {
      return storedParams[param]?.value
    },
    [storedParams],
  )

  // Get stored type from IndexedDB for a manual param
  const getStoredManualType = useCallback(
    (param: string): ParameterType | undefined => {
      return storedParams[param]?.type
    },
    [storedParams],
  )

  const contextValue = useMemo(
    () => ({
      values,
      setParameterValue,
      setParameterValues,
      setParameterType,
      getSourceValues,
      getParameterType,
      currentSource,
      setCurrentSource,
      selectedDatasetId,
      setSelectedDatasetId,
      getStoredManualValue,
      getStoredManualType,
      isStorageLoaded,
    }),
    [
      values,
      setParameterValue,
      setParameterValues,
      setParameterType,
      getSourceValues,
      getParameterType,
      currentSource,
      selectedDatasetId,
      getStoredManualValue,
      getStoredManualType,
      isStorageLoaded,
    ],
  )

  return (
    <DocumentParametersContext.Provider value={contextValue}>
      {children}
    </DocumentParametersContext.Provider>
  )
}

export function useDocumentParameterValues() {
  const context = useContext(DocumentParametersContext)
  if (!context) {
    throw new Error(
      'useDocumentParameterValues must be used within DocumentParametersProvider',
    )
  }
  return context
}

export function useFormattedParameters() {
  const { values, currentSource } = useDocumentParameterValues()

  return useMemo(() => {
    const sourceValues = currentSource ? values[currentSource] : values.manual
    return Object.fromEntries(
      Object.entries(sourceValues).map(([key, value]) => {
        try {
          return [key, JSON.parse(value)]
        } catch (_e) {
          return [key, value]
        }
      }),
    )
  }, [values, currentSource])
}
