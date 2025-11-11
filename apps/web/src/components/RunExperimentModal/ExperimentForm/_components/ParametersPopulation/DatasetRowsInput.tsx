import { ExperimentFormPayload } from '../../useExperimentFormPayload'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { FormFieldGroup } from '@latitude-data/web-ui/atoms/FormFieldGroup'
import { ReactStateDispatch } from '@latitude-data/web-ui/commonTypes'
import { SwitchInput } from '@latitude-data/web-ui/atoms/Switch'
import useDatasetRowsCount from '$/stores/datasetRowsCount'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { debounce } from 'lodash-es'

type Range = { from: number; to: number }

function scopedInRange(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function LineRangeInputs({
  disabled,
  defaultRange,
  onChangeRange,
  max,
}: {
  disabled: boolean
  defaultRange: Range
  onChangeRange: ReactStateDispatch<Range>
  max: number | undefined
}) {
  const [fromText, setFromText] = useState(defaultRange.from.toString())
  const [toText, setToText] = useState(defaultRange.to.toString())

  useEffect(() => {
    setFromText(defaultRange.from.toString())
  }, [defaultRange.from])
  useEffect(() => {
    setToText(defaultRange.to.toString())
  }, [defaultRange.to])

  const setFromValue = useCallback(
    (value: number) => {
      const newVal = scopedInRange(value, 1, max ?? value)
      onChangeRange((prev) => ({
        from: newVal,
        to: Math.max(newVal, prev.to),
      }))
    },
    [onChangeRange, max],
  )

  const setToValue = useCallback(
    (value: number) => {
      const newVal = scopedInRange(value, 1, max ?? value)
      onChangeRange((prev) => ({
        from: Math.min(newVal, prev.from),
        to: newVal,
      }))
    },
    [onChangeRange, max],
  )

  const debouncedFrom = useRef(debounce(setFromValue, 500)).current
  const debouncedTo = useRef(debounce(setToValue, 500)).current

  return (
    <FormFieldGroup>
      <Input
        disabled={disabled}
        type='number'
        name='fromLine'
        label='From line'
        value={fromText}
        placeholder='Starting line'
        onChange={(e) => {
          setFromText(e.target.value)
          const n = Number(e.target.value)
          if (!isNaN(n)) debouncedFrom(n)
        }}
        min={1}
        max={max}
      />

      <Input
        disabled={disabled}
        type='number'
        name='toLine'
        label='To line'
        value={toText}
        placeholder='Ending line'
        onChange={(e) => {
          setToText(e.target.value)
          const n = Number(e.target.value)
          if (!isNaN(n)) debouncedTo(n)
        }}
        min={1}
        max={max}
      />
    </FormFieldGroup>
  )
}

function RowsInputs({
  rowCount,
  setFromLine,
  setToLine,
}: {
  rowCount: number
  setFromLine: (value: number | undefined) => void
  setToLine: (value: number | undefined) => void
}) {
  const [selectedRows, setSelectedRows] = useState<Range>({
    from: 1,
    to: rowCount,
  })
  const [allRows, setAllRows] = useState(true)

  useEffect(() => {
    if (allRows) {
      setFromLine(undefined)
      setToLine(undefined)
    } else {
      setFromLine(selectedRows.from)
      setToLine(selectedRows.to)
    }
  }, [allRows, selectedRows, setFromLine, setToLine])

  useEffect(() => {
    setSelectedRows({
      from: 1,
      to: rowCount,
    })
    setAllRows(true)
  }, [rowCount, setToLine])

  return (
    <div className='flex flex-col gap-y-2 w-1/2'>
      <LineRangeInputs
        disabled={allRows}
        defaultRange={selectedRows}
        onChangeRange={setSelectedRows}
        max={rowCount}
      />
      <SwitchInput
        name='fullDataset'
        checked={allRows}
        onCheckedChange={() => setAllRows((prev) => !prev)}
        label='Include all lines'
        description='You can pass to evaluations all lines from a dataset or a selection from one line to another. Uncheck this option to select the lines.'
      />
    </div>
  )
}

export function DatasetRowsInput({
  selectedDataset,
  setFromLine,
  setToLine,
}: ExperimentFormPayload) {
  const { data: rowCount, isLoading: isLoadingRowCount } = useDatasetRowsCount({
    dataset: selectedDataset,
  })

  if (!selectedDataset) {
    return <Text.H6 color='foregroundMuted'>You must select a dataset</Text.H6>
  }

  if (isLoadingRowCount) {
    return (
      <div className='flex flex-col gap-y-2 w-2/3'>
        <Skeleton height='h2' className='w-2/3' />
        <Skeleton height='h2' className='w-2/3' />
      </div>
    )
  }

  return (
    <RowsInputs
      rowCount={rowCount!}
      setFromLine={setFromLine}
      setToLine={setToLine}
    />
  )
}
