import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { EvaluationV2 } from '@latitude-data/constants'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Select, SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { useCallback, useEffect, useMemo } from 'react'
import { ExperimentFormPayload } from '../../useExperimentFormPayload'
import { useLabels } from '../useLabels'

function DatasetLabelSelector({
  evaluation,
  labels,
  datasetLabels,
  setDatasetLabels,
}: {
  evaluation: EvaluationV2
  labels: SelectOption<number>[]
  datasetLabels: Record<string, string>
  setDatasetLabels: ReactStateDispatch<Record<string, string>>
}) {
  const specification = getEvaluationMetricSpecification(evaluation)

  const options = useMemo(
    () =>
      labels.map((label) => ({
        ...label,
        value: label.label,
      })),
    [labels],
  )

  const value = datasetLabels[evaluation.uuid]
  const setValue = useCallback(
    (newLabel: string) => {
      setDatasetLabels((prev) => ({
        ...prev,
        [evaluation.uuid]: newLabel,
      }))
    },
    [evaluation.uuid, setDatasetLabels],
  )

  if (!specification.requiresExpectedOutput) return null

  return (
    <Select
      key={evaluation.uuid}
      name={`expectedOutput-${evaluation.uuid}`}
      label={
        <div className='flex flex-row items-center gap-2'>
          <Text.H5>Expected output for</Text.H5>
          <Badge
            variant='muted'
            iconProps={{
              name: specification.icon,
              color: 'foregroundMuted',
              placement: 'start',
            }}
          >
            {evaluation.name}
          </Badge>
        </div>
      }
      options={options}
      value={value}
      onChange={setValue}
      placeholder='Select column'
      disabled={labels.length === 0}
      required
    />
  )
}

export function ParametersSelection({
  selectedDataset,
  parametersMap,
  setParametersMap,
  selectedEvaluations,
  datasetLabels,
  setDatasetLabels,
  parameters,
}: ExperimentFormPayload) {
  const { labels, buildLabels } = useLabels()
  useEffect(() => {
    if (!selectedDataset) return
    buildLabels(selectedDataset)
  }, [selectedDataset, buildLabels])

  const selectParameter = useCallback(
    (parameter: string, columnIndex: number) => {
      setParametersMap((prev) => ({
        ...prev,
        [parameter]: columnIndex,
      }))
    },
    [setParametersMap],
  )

  useEffect(() => {
    if (!selectedDataset) return
    if (!parameters) return

    setParametersMap(
      Object.fromEntries(
        selectedDataset.columns
          .map((col, index) => {
            if (!parameters.includes(col.name)) return null
            return [col.name, index]
          })
          .filter(Boolean) as [string, number][],
      ),
    )
  }, [selectedDataset, parameters, setParametersMap])

  if (!selectedDataset) {
    return null
  }

  if (!parameters) {
    return (
      <div className='flex flex-col gap-y-3 w-2/3'>
        <Skeleton className='h-6 w-full' />
        <Skeleton className='h-6 w-full' />
        <Skeleton className='h-6 w-full' />
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-y-3 w-2/3'>
      {parameters.map((param) => (
        <Select
          key={param}
          name={param}
          badgeLabel
          label={param}
          options={labels}
          value={parametersMap[param]}
          onChange={(headerIndex) => {
            selectParameter(param, Number(headerIndex))
          }}
          placeholder='Select column'
        />
      ))}

      {selectedEvaluations.map((evaluation) => (
        <DatasetLabelSelector
          key={evaluation.uuid}
          evaluation={evaluation}
          labels={labels}
          datasetLabels={datasetLabels}
          setDatasetLabels={setDatasetLabels}
        />
      ))}
    </div>
  )
}
