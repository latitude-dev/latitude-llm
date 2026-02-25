import { useCurrentUrl } from '$/hooks/useCurrentUrl'
import { executeFetch } from '$/hooks/useFetcher'
import { useNavigate } from '$/hooks/useNavigate'
import { ROUTES } from '$/services/routes'
import { compactObject } from '@latitude-data/core/lib/compactObject'
import { useToast } from '@latitude-data/web-ui/atoms/Toast'
import { useCallback, useMemo, useState } from 'react'
import { Dataset } from '@latitude-data/core/schema/models/types/Dataset'

export type WithPositionData = {
  position: number
  page: number
}
const buildFetcher =
  ({
    toast,
    navigate,
    currentUrl,
  }: {
    toast: ReturnType<typeof useToast>['toast']
    navigate: ReturnType<typeof useNavigate>
    currentUrl: string
  }) =>
  async ({
    dataset,
    datasetRowId,
  }: {
    dataset: Dataset | null
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
      currentUrl,
    })

    return response ?? { position: 1, page: 1 }
  }

export function useDatasetRowPosition() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const currentUrl = useCurrentUrl()
  const fetchPosition = useMemo(
    () => buildFetcher({ toast, navigate, currentUrl }),
    [toast, navigate, currentUrl],
  )
  const [position, setPosition] = useState<number | undefined>(undefined)
  const [isLoadingPosition, setIsLoadingPosition] = useState(false)
  const getPosition = useCallback(
    async ({
      dataset,
      datasetRowId,
    }: {
      dataset: Dataset | null
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
