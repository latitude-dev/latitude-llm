import { useCallback, useState } from 'react'
import { executeFetch } from '$/hooks/useFetcher'
import { DatasetV2 } from '@latitude-data/core/browser'
import { ROUTES } from '$/services/routes'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { useNavigate } from '$/hooks/useNavigate'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'

export type WithPositionData = {
  position: number
  page: number
}
const buildFetcher =
  ({
    toast,
    navigate,
  }: {
    toast: ReturnType<typeof useToast>['toast']
    navigate: ReturnType<typeof useNavigate>
  }) =>
  async ({
    dataset,
    datasetRowId,
  }: {
    dataset: DatasetV2 | null
    datasetRowId?: number
  }) => {
    if (!dataset) return undefined
    if (!dataset || !datasetRowId) return { position: 1, page: 1 }

    const route = ROUTES.api.datasetsRows.withPosition(datasetRowId).root
    const response = await executeFetch<WithPositionData>({
      route,
      searchParams: compactObject({
        datasetId: dataset.id,
      }) as Record<string, string>,
      toast,
      navigate,
    })

    return response ?? { position: 1, page: 1 }
  }

export function useDatasetRowPosition() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const fetchPosition = buildFetcher({ toast, navigate })
  const [position, setPosition] = useState<number | undefined>(undefined)
  const [isLoadingPosition, setIsLoadingPosition] = useState(false)
  const getPosition = useCallback(
    async ({
      dataset,
      datasetRowId,
    }: {
      dataset: DatasetV2 | null
      datasetRowId?: number
    }) => {
      setIsLoadingPosition(true)
      const position = await fetchPosition({ dataset, datasetRowId })
      setPosition(position?.position)
      setIsLoadingPosition(false)
    },
    [fetchPosition, setPosition],
  )

  return { position, getPosition, isLoadingPosition, setPosition }
}
