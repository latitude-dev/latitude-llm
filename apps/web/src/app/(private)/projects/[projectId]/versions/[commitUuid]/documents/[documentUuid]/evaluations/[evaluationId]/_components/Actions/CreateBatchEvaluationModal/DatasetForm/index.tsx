import { RunBatchParameters } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/documents/[documentUuid]/evaluations/[evaluationId]/_components/Actions/CreateBatchEvaluationModal/useRunBatch'
import { getEvaluationMetricSpecification } from '$/components/evaluations'
import { ROUTES } from '$/services/routes'
import {
  Dataset,
  DatasetV2,
  DocumentVersion,
  EvaluationTmp,
} from '@latitude-data/core/browser'
import {
  FormFieldGroup,
  Icon,
  Input,
  NumeredList,
  ReactStateDispatch,
  Select,
  SelectOption,
  Skeleton,
  SwitchInput,
  Text,
} from '@latitude-data/web-ui'
import { isNumber } from 'lodash-es'
import Link from 'next/link'
import { useMemo } from 'react'

function findValue({
  headers,
  parameters,
  param,
}: {
  headers: SelectOption<string>[]
  parameters: RunBatchParameters
  param: string
}) {
  const index = parameters?.[param]
  const header = isNumber(index) ? headers[index + 1] : undefined
  return header ? String(header.value) : ''
}

function LineRangeInputs({
  disabled,
  fromDefaultValue,
  toDefaultValue,
  onChangeFromLine,
  onChangeToLine,
  max,
}: {
  disabled: boolean
  fromDefaultValue: number | undefined
  toDefaultValue: number | undefined
  onChangeFromLine: ReactStateDispatch<number>
  onChangeToLine: ReactStateDispatch<number | undefined>
  max: number | undefined
}) {
  return (
    <FormFieldGroup>
      <Input
        disabled={disabled}
        type='number'
        name='fromLine'
        label='From line'
        defaultValue={fromDefaultValue}
        placeholder='Starting line'
        onChange={(e) => {
          onChangeFromLine(Number(e.target.value))
        }}
        min={1}
        max={toDefaultValue}
      />
      <Input
        disabled={disabled}
        type='number'
        name='toLine'
        label='To line'
        placeholder='Ending line'
        value={toDefaultValue}
        onChange={(e) => {
          onChangeToLine(Number(e.target.value))
        }}
        min={fromDefaultValue}
        max={max}
      />
    </FormFieldGroup>
  )
}

export default function DatasetForm({
  document,
  evaluation,
  onParametersChange,
  parameters,
  selectedDataset,
  headers,
  labels,
  wantAllLines,
  fromLine,
  toLine,
  datasetLabel,
  onChangeFromLine,
  onChangeToLine,
  onChangeDatasetLabel,
  datasets,
  isLoadingDatasets,
  parametersList,
  onToggleAllLines,
  onSelectDataset,
  errors,
  maxLineCount,
}: {
  document: DocumentVersion
  evaluation?: EvaluationTmp
  onParametersChange: (param: string) => (header: string) => void
  parameters: RunBatchParameters
  parametersList: string[]
  wantAllLines: boolean
  fromLine: number | undefined
  toLine: number | undefined
  datasetLabel?: string | undefined
  onChangeFromLine: ReactStateDispatch<number>
  onChangeToLine: ReactStateDispatch<number | undefined>
  onChangeDatasetLabel?: ReactStateDispatch<string | undefined>
  headers: SelectOption<string>[]
  labels?: SelectOption<string>[]
  selectedDataset: Dataset | DatasetV2 | null
  datasets: Dataset[] | DatasetV2[]
  isLoadingDatasets: boolean
  onSelectDataset: (value: number) => void
  onToggleAllLines: (checked: boolean) => void
  errors: Record<string, string[] | undefined> | undefined
  maxLineCount: number | undefined
}) {
  const filteredHeaders = useMemo(
    () => headers.filter((h) => h.value !== ''),
    [headers],
  )
  const paramaterErrors = useMemo(() => {
    if (!errors) return {}
    if (!errors.parameters) return {}

    const paramErrors = errors.parameters
    if (!Array.isArray(paramErrors)) return {}

    return paramErrors.reduce(
      (acc, error) => {
        const parts = error.split(': ')
        const param = parts[0]
        const message = parts[1]
        if (!param || !message) return acc

        const prevMessage = acc[param] || []
        prevMessage.push(message)
        acc[param] = prevMessage
        return acc
      },
      {} as Record<string, string[]>,
    )
  }, [errors])
  const datasetOptions = useMemo(
    () => datasets.map((ds) => ({ value: ds.id, label: ds.name })),
    [datasets],
  )
  const noDatasets = !isLoadingDatasets && datasets.length === 0
  const selectDatasetComponent = (
    <Select
      name='datasetId'
      placeholder='Select dataset'
      disabled={noDatasets}
      options={datasetOptions}
      onChange={onSelectDataset}
      defaultValue={selectedDataset?.id}
    />
  )

  const specification =
    evaluation?.version === 'v2'
      ? getEvaluationMetricSpecification(evaluation)
      : undefined

  return (
    <>
      <NumeredList>
        <NumeredList.Item title='Pick dataset'>
          {isLoadingDatasets ? (
            <Skeleton height='h2' className='w-1/2' />
          ) : (
            <div className='flex flex-row items-center gap-4'>
              {!noDatasets && (
                <div className='w-1/2'>{selectDatasetComponent}</div>
              )}
              <div className='flex flex-row items-center gap-2'>
                {noDatasets && (
                  <>
                    <Link
                      className='flex flex-row items-center gap-1 hover:underline'
                      href={ROUTES.datasets.root({ modal: 'new' })}
                    >
                      <Text.H5 color='primary'>Upload dataset</Text.H5>
                      <Icon color='primary' name='externalLink' />
                    </Link>
                    <Text.H6M>or</Text.H6M>
                  </>
                )}
                <Link
                  className='flex flex-row items-center gap-1 hover:underline'
                  href={ROUTES.datasets.root({
                    modal: 'generate',
                    name: `Dataset for prompt: ${document.path}`,
                    parameters: parametersList.join(','),
                    backUrl: window.location.href,
                  })}
                >
                  <Text.H5 color='primary'>Generate dataset</Text.H5>
                  <Icon color='primary' name='externalLink' />
                </Link>
              </div>
            </div>
          )}
        </NumeredList.Item>
        <NumeredList.Item title='Select lines from dataset' width='w-1/2'>
          {selectedDataset ? (
            <div className='flex flex-col gap-y-2'>
              <LineRangeInputs
                disabled={wantAllLines}
                fromDefaultValue={fromLine}
                toDefaultValue={toLine}
                onChangeFromLine={onChangeFromLine}
                onChangeToLine={onChangeToLine}
                max={maxLineCount}
              />
              <SwitchInput
                name='wantAllLines'
                disabled={!selectedDataset}
                defaultChecked={wantAllLines}
                onCheckedChange={onToggleAllLines}
                label='Include all lines'
                description='You can pass to evaluations all lines from a dataset or a selection from one line to another. Uncheck this option to select the lines.'
              />
            </div>
          ) : null}
        </NumeredList.Item>
        <NumeredList.Item
          title='Select the columns that contain the data to fill out the variables'
          width='w-1/2'
        >
          {selectedDataset ? (
            <div className='flex flex-col gap-y-3'>
              {parametersList.map((param) => {
                return (
                  <Select
                    key={param}
                    name={`parameter[${param}]`}
                    disabled={filteredHeaders.length === 0}
                    errors={paramaterErrors[param]}
                    badgeLabel
                    label={param}
                    options={filteredHeaders}
                    value={findValue({
                      headers: filteredHeaders,
                      parameters,
                      param,
                    })}
                    onChange={onParametersChange(param)}
                    placeholder='Select csv column'
                  />
                )
              })}
            </div>
          ) : null}
        </NumeredList.Item>
        {specification?.requiresExpectedOutput && (
          <NumeredList.Item
            title='Select the column that contains the expected output'
            width='w-1/2'
          >
            {selectedDataset ? (
              <div className='flex flex-col gap-y-3'>
                <Select
                  name='datasetLabel'
                  disabled={labels!.length === 0}
                  errors={errors?.datasetLabel}
                  options={labels!}
                  value={datasetLabel!}
                  onChange={onChangeDatasetLabel!}
                  placeholder='Select csv column'
                />
              </div>
            ) : null}
          </NumeredList.Item>
        )}
      </NumeredList>
    </>
  )
}
