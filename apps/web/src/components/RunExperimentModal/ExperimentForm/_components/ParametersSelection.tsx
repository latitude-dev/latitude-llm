import { ExperimentFormPayload } from '../useExperimentFormPayload'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { useCallback, useEffect, useMemo } from 'react'
import { useMetadata } from '$/hooks/useMetadata'
import { Select, SelectOption } from '@latitude-data/web-ui/atoms/Select'
import { useLabels } from './useLabels'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { Badge } from '@latitude-data/web-ui/atoms/Badge'
import { Icon } from '@latitude-data/web-ui/atoms/Icons'
import { EvaluationV2, LlmEvaluationMetric } from '@latitude-data/constants'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'

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
  const canContainLabel =
    specification.requiresExpectedOutput ||
    evaluation.metric === LlmEvaluationMetric.Custom

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

  if (!canContainLabel) return null

  return (
    <Select
      key={evaluation.uuid}
      name={`expectedOutput-${evaluation.uuid}`}
      required={specification.requiresExpectedOutput}
      label={
        <div className='flex flex-row items-center gap-2'>
          <Text.H5>Expected output for</Text.H5>
          <Badge variant='muted'>
            <Icon
              name={specification.icon}
              className='mr-1'
              color='foregroundMuted'
            ></Icon>
            <Text.H6 color='foregroundMuted'>{evaluation.name}</Text.H6>
          </Badge>
        </div>
      }
      options={options}
      value={value}
      onChange={setValue}
      placeholder='Select column'
      disabled={labels.length === 0}
    />
  )
}

export function ParametersSelection({
  document,
  selectedDataset,
  parametersMap,
  setParametersMap,
  selectedEvaluations,
  datasetLabels,
  setDatasetLabels,
}: ExperimentFormPayload) {
  const { metadata, runReadMetadata } = useMetadata()
  useEffect(() => {
    runReadMetadata({
      prompt: document.content ?? '',
      fullPath: document.path,
      promptlVersion: document.promptlVersion,
    })
  }, [document])

  const { labels, buildLabels } = useLabels()
  useEffect(() => {
    if (!selectedDataset) return
    buildLabels(selectedDataset)
  }, [selectedDataset, buildLabels])

  const parameters = useMemo(() => {
    if (!metadata) return undefined
    return Array.from(metadata.parameters)
  }, [metadata])

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
    if (!metadata) return

    setParametersMap(
      Object.fromEntries(
        selectedDataset.columns
          .map((col, index) => {
            if (!metadata.parameters.has(col.name)) return undefined
            return [col.name, index]
          })
          .filter(Boolean) as [string, number][],
      ),
    )
  }, [selectedDataset, metadata])

  if (!selectedDataset) {
    return <Text.H6 color='foregroundMuted'>You must select a dataset</Text.H6>
  }

  if (!parameters) {
    return (
      <div className='flex flex-col gap-y-3'>
        <Skeleton className='h-6 w-full' />
        <Skeleton className='h-6 w-full' />
        <Skeleton className='h-6 w-full' />
      </div>
    )
  }

  return (
    <div className='flex flex-col gap-y-3'>
      {parameters.map((param) => (
        <Select
          key={param}
          name={param}
          badgeLabel
          label={param}
          options={labels}
          value={parametersMap[param]}
          onChange={(headerIndex) => {
            selectParameter(param, headerIndex)
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
