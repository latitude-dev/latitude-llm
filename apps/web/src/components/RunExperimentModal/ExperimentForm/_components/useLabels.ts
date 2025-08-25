import { useCallback, useState } from 'react'
import type { Dataset } from '@latitude-data/core/browser'
import type { SelectOption } from '@latitude-data/web-ui/atoms/Select'
import LabelIndicator from './LabelIndicator'

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
    [],
  )

  return { labels, buildLabels }
}
