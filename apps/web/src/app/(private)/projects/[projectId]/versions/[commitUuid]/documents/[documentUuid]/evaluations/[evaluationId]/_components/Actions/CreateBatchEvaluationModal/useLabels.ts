import { useCallback, useState } from 'react'
import { Dataset } from '@latitude-data/core/browser'
import LabelIndicator from './LabelIndicator'
import { SelectOption } from '@latitude-data/web-ui/atoms/Select'

export function useLabels() {
  const [labels, setLabels] = useState<SelectOption<string>[]>([])
  const buildLabels = useCallback(
    (dataset: Dataset) =>
      setLabels([
        ...dataset.columns
          .filter((column) => column.role === 'label')
          .map((column) => ({
            icon: LabelIndicator(),
            label: column.name,
            value: column.name,
          })),
        ...dataset.columns
          .filter((column) => column.role !== 'label')
          .map((column) => ({ label: column.name, value: column.name })),
      ]),
    [setLabels],
  )

  return { labels, buildLabels }
}
