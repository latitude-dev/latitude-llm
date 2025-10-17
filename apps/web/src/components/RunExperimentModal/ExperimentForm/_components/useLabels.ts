import { useCallback, useState } from 'react'
import { SelectOption } from '@latitude-data/web-ui/atoms/Select'
import LabelIndicator from './LabelIndicator'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'

export function useLabels() {
  const [labels, setLabels] = useState<SelectOption<number>[]>([])
  const buildLabels = useCallback(
    (dataset: Dataset) =>
      setLabels([
        ...dataset.columns
          .map((column, index) => ({
            icon: column.role === 'label' ? LabelIndicator() : undefined,
            label: column.name,
            value: index,
          }))
          .sort((a, b) => {
            if (a.icon && !b.icon) return 1
            if (!a.icon && b.icon) return -1
            return 0
          }),
      ]),
    [setLabels],
  )

  return { labels, buildLabels }
}
