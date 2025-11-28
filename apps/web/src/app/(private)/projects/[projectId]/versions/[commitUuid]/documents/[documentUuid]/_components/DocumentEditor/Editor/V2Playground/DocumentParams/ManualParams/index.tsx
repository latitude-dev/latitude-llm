import { useCallback, useEffect, useRef } from 'react'
import { ParameterInput } from '$/components/ParameterInput'
import { ParameterType } from '@latitude-data/constants'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { INPUT_SOURCE } from '@latitude-data/core/lib/documentPersistedInputs'
import { useDocumentParameterValues } from '../DocumentParametersContext'
import { ParameterTypeSelector } from './ParameterTypeSelector'
import { NoInputsMessage } from '../NoInputsMessage'

export function ManualParams({
  metadataParameters,
}: {
  metadataParameters: string[]
}) {
  const {
    getSourceValues,
    setParameterValue,
    setParameterValues,
    getParameterType,
    setParameterType,
    getStoredManualValue,
    getStoredManualType,
    isStorageLoaded,
  } = useDocumentParameterValues()
  const manualValues = getSourceValues(INPUT_SOURCE.manual)
  const initializedParamsRef = useRef<Set<string>>(new Set())

  // Pre-populate parameters with stored values when storage is loaded
  useEffect(() => {
    if (!isStorageLoaded) return

    const valuesToRestore: Record<string, string> = {}

    for (const param of metadataParameters) {
      // Skip if already initialized or already has a value
      if (initializedParamsRef.current.has(param)) continue
      if (manualValues[param] !== undefined && manualValues[param] !== '')
        continue

      const storedValue = getStoredManualValue(param)
      const storedType = getStoredManualType(param)

      if (storedValue !== undefined) {
        valuesToRestore[param] = storedValue
      }

      if (storedType !== undefined) {
        setParameterType(INPUT_SOURCE.manual, param, storedType)
      }

      initializedParamsRef.current.add(param)
    }

    if (Object.keys(valuesToRestore).length > 0) {
      setParameterValues(INPUT_SOURCE.manual, valuesToRestore)
    }
  }, [
    isStorageLoaded,
    metadataParameters,
    manualValues,
    getStoredManualValue,
    getStoredManualType,
    setParameterValues,
    setParameterType,
  ])

  const handleInputChange = useCallback(
    (param: string, value: string) => {
      setParameterValue(INPUT_SOURCE.manual, param, value)
    },
    [setParameterValue],
  )

  const handleTypeChange = useCallback(
    (param: string, type: ParameterType) => {
      setParameterType(INPUT_SOURCE.manual, param, type)
    },
    [setParameterType],
  )

  return (
    <div className='flex flex-col gap-3'>
      {metadataParameters.length > 0 ? (
        <div className='grid grid-cols-[auto_1fr] gap-y-3'>
          {metadataParameters.map((param) => {
            const value = manualValues[param] ?? ''
            const paramType = getParameterType(INPUT_SOURCE.manual, param)
            return (
              <div
                key={param}
                className='grid col-span-2 grid-cols-subgrid gap-3 w-full items-start'
              >
                <div className='flex flex-row items-center gap-x-2 min-h-8'>
                  <ParameterTypeSelector
                    parameter={param}
                    parameterType={paramType}
                    onTypeChange={(type) => handleTypeChange(param, type)}
                  />
                  <Badge variant='accent'>
                    &#123;&#123;{param}&#125;&#125;
                  </Badge>
                </div>
                <div className='flex flex-grow w-full min-w-0'>
                  <ParameterInput
                    name={param}
                    value={value}
                    type={paramType}
                    onChange={(newValue) => handleInputChange(param, newValue)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <NoInputsMessage />
      )}
    </div>
  )
}
