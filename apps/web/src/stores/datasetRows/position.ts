import useFetcher from '$/hooks/useFetcher'
import { ROUTES } from '$/services/routes'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { compact } from 'lodash-es'
import useSWR, { SWRConfiguration } from 'swr'

import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'

import { DatasetRow } from '@latitude-data/core/schema/models/types/DatasetRow'
type Position = {
  position: number
  page: number
}

export default function useDatasetRowPosition(
  {
    dataset,
    datasetRow,
    pageSize,
  }: {
    dataset: Dataset
    datasetRow: DatasetRow
    pageSize?: number
  },
  opts?: SWRConfiguration,
) {
  const route = ROUTES.api.datasetsRows.withPosition(datasetRow.id).root
  const fetcher = useFetcher<Position>(route, {
    searchParams: compactObject({
      datasetId: dataset.id,
      pageSize: pageSize,
    }) as Record<string, string>,
  })

  const { data = { position: 1, page: 1 }, ...rest } = useSWR<Position>(
    compact(['datasetRowPosition', dataset.id, datasetRow.id]),
    fetcher,
    opts,
  )

  return {
    data,
    ...rest,
  }
}
