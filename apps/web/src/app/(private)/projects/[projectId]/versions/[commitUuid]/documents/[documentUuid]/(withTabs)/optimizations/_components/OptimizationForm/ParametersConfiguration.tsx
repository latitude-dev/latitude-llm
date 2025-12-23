import useDatasets from '$/stores/datasets'
import { OptimizationConfiguration } from '@latitude-data/constants'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { Select, SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { SwitchToggle } from '@latitude-data/web-ui/atoms/Switch'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Tooltip } from '@latitude-data/web-ui/atoms/Tooltip'
import { useCallback, useEffect, useMemo, useRef } from 'react'

type ParameterConfig = NonNullable<
  NonNullable<OptimizationConfiguration['parameters']>[string]
>

function ParameterField({
  parameter,
  config,
  columnOptions,
  hasDataset,
  onChange,
  disabled,
}: {
  parameter: string
  config?: ParameterConfig
  columnOptions: SelectOption<string>[]
  hasDataset: boolean
  onChange: (config: ParameterConfig) => void
  disabled?: boolean
}) {
  const handleColumnChange = useCallback(
    (column: string) => {
      onChange({ ...config, column: column || undefined })
    },
    [config, onChange],
  )

  const handlePiiChange = useCallback(
    (isPii: boolean) => {
      onChange({ ...config, isPii })
    },
    [config, onChange],
  )

  return (
    <div className='flex flex-row items-center gap-3'>
      <Badge variant='accent'>&#123;&#123;{parameter}&#125;&#125;</Badge>
      <div className='flex-1'>
        <Select
          value={config?.column ?? ''}
          name={`param-${parameter}-column`}
          placeholder={hasDataset ? 'Select column' : parameter}
          options={columnOptions}
          onChange={handleColumnChange}
          disabled={disabled || !hasDataset}
        />
      </div>
      <Tooltip
        asChild
        maxWidth='max-w-[310px]'
        delayDuration={750}
        trigger={
          <div className='flex items-center gap-2 pr-2'>
            <SwitchToggle
              checked={config?.isPii ?? false}
              onCheckedChange={handlePiiChange}
              disabled={disabled}
            />
            <Text.H6M>Mark as PII</Text.H6M>
          </div>
        }
      >
        Mask this parameter during optimization to avoid leaking Personally
        Identifiable Information.
      </Tooltip>
    </div>
  )
}

export function ParametersConfiguration({
  parameters,
  metadata,
  datasetId,
  parametersConfig,
  onParametersChange,
  errors,
  disabled,
}: {
  parameters: string[]
  metadata?: Record<string, { isPii?: boolean }>
  datasetId?: number
  parametersConfig?: OptimizationConfiguration['parameters']
  onParametersChange: (params: OptimizationConfiguration['parameters']) => void
  errors?: Record<string, string[]>
  disabled?: boolean
}) {
  const { data: datasets } = useDatasets({
    page: '1',
    pageSize: '10000', // No pagination
  })

  const initializedRef = useRef(false)
  useEffect(() => {
    if (initializedRef.current) return
    if (!metadata) return
    if (parameters.length === 0) return

    const hasAnyPiiInMetadata = parameters.some(
      (param) => metadata[param]?.isPii,
    )
    if (!hasAnyPiiInMetadata) return

    initializedRef.current = true
    const initialConfig: OptimizationConfiguration['parameters'] = {}
    for (const param of parameters) {
      const metadataParam = metadata[param]
      initialConfig[param] = {
        ...parametersConfig?.[param],
        isPii: parametersConfig?.[param]?.isPii ?? metadataParam?.isPii,
      }
    }
    onParametersChange(initialConfig)
  }, [parameters, metadata, parametersConfig, onParametersChange])

  const dataset = useMemo(
    () => datasets?.find((d) => d.id === datasetId),
    [datasets, datasetId],
  )

  const columnOptions = useMemo((): SelectOption<string>[] => {
    if (!dataset) return []
    return dataset.columns.map((col) => ({
      value: col.name,
      label: col.name,
    }))
  }, [dataset])

  const prevDatasetIdRef = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (prevDatasetIdRef.current === datasetId) return
    prevDatasetIdRef.current = datasetId

    if (!dataset) return
    if (parameters.length === 0) return

    const columnNames = new Set(dataset.columns.map((col) => col.name))
    const hasAnyMatchingColumn = parameters.some((param) =>
      columnNames.has(param),
    )
    if (!hasAnyMatchingColumn) return

    const updatedConfig: OptimizationConfiguration['parameters'] = {
      ...parametersConfig,
    }
    for (const param of parameters) {
      if (columnNames.has(param)) {
        updatedConfig[param] = {
          ...parametersConfig?.[param],
          column: param,
        }
      }
    }
    onParametersChange(updatedConfig)
  }, [dataset, datasetId, parameters, parametersConfig, onParametersChange])

  const handleParameterChange = useCallback(
    (parameter: string, config: ParameterConfig) => {
      onParametersChange({
        ...parametersConfig,
        [parameter]: config,
      })
    },
    [parametersConfig, onParametersChange],
  )

  return (
    <FormFieldGroup
      label='Parameters'
      description='The dataset columns used to fill the prompt parameters during optimization'
      layout='vertical'
      errors={errors?.['parameters']}
    >
      <div className='flex flex-col gap-3'>
        {parameters.map((param) => (
          <ParameterField
            key={param}
            parameter={param}
            config={parametersConfig?.[param]}
            columnOptions={columnOptions}
            hasDataset={!!datasetId}
            onChange={(config) => handleParameterChange(param, config)}
            disabled={disabled}
          />
        ))}
      </div>
    </FormFieldGroup>
  )
}
