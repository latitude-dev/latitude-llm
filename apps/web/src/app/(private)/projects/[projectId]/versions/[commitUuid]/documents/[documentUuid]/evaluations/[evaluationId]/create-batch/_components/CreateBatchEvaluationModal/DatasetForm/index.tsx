import { useMemo, useState } from 'react'

import { Dataset } from '@latitude-data/core/browser'
import {
  FormFieldGroup,
  Input,
  NumeredList,
  Select,
  SelectOption,
  SwitchInput,
} from '@latitude-data/web-ui'

function LineRangeInputs({
  disabled,
  fromDefaultValue,
  toDefaultValue,
  max,
}: {
  disabled: boolean
  fromDefaultValue: number | undefined
  toDefaultValue: number | undefined
  max: number | undefined
}) {
  const [to, setTo] = useState(toDefaultValue)
  return (
    <FormFieldGroup>
      <Input
        disabled={disabled}
        type='number'
        name='fromLine'
        label='From line'
        defaultValue={fromDefaultValue}
        placeholder='Starting line'
        min={0}
        max={to}
      />
      <Input
        disabled={disabled}
        type='number'
        name='fromLine'
        label='To line'
        placeholder='Ending line'
        defaultValue={toDefaultValue}
        onChange={(e) => setTo(Number(e.target.value))}
        min={0}
        max={max}
      />
    </FormFieldGroup>
  )
}

export default function DatasetForm({
  onParametersChange,
  selectedDataset,
  headers,
  wantAllLines,
  fromLine,
  toLine,
  datasets,
  isLoadingDatasets,
  parametersList,
  onToggleAllLines,
  onSelectDataset,
  errors,
}: {
  onParametersChange: (param: string) => (header: string) => void
  parametersList: string[]
  wantAllLines: boolean
  fromLine: number | undefined
  toLine: number | undefined
  headers: SelectOption[]
  selectedDataset: Dataset | null
  datasets: Dataset[]
  isLoadingDatasets: boolean
  onSelectDataset: (value: string) => void
  onToggleAllLines: (checked: boolean) => void
  errors: Record<string, string[] | undefined> | undefined
}) {
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
  return (
    <>
      <NumeredList>
        <NumeredList.Item title='Pick dataset' width='w-1/2'>
          <Select
            name='datasetId'
            placeholder='Select dataset'
            disabled={isLoadingDatasets}
            options={datasetOptions}
            onChange={onSelectDataset}
            defaultValue={selectedDataset?.id?.toString()}
          />
        </NumeredList.Item>
        <NumeredList.Item title='Select lines from dataset' width='w-1/2'>
          {selectedDataset ? (
            <div className='flex flex-col gap-y-2'>
              <LineRangeInputs
                disabled={wantAllLines}
                fromDefaultValue={fromLine}
                toDefaultValue={toLine}
                max={selectedDataset?.fileMetadata?.rowCount}
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
              {parametersList.map((param) => (
                <Select
                  key={param}
                  name={`parameter[${param}]`}
                  disabled={headers.length === 0}
                  errors={paramaterErrors[param]}
                  badgeLabel
                  label={param}
                  options={headers}
                  onChange={onParametersChange(param)}
                  placeholder='Select csv column'
                />
              ))}
            </div>
          ) : null}
        </NumeredList.Item>
      </NumeredList>
    </>
  )
}
