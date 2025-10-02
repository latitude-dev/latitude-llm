import { format } from 'date-fns'
import { useGenerateDocumentLogDetailUrl } from '$/hooks/useGenerateDocumentLogDetailUrl'
import {
  DocumentLog,
  EvaluatedDocumentLog,
} from '@latitude-data/core/constants'

export function usePaginatedDocumentLogUrl({
  page,
  selectedLog,
  isLoading,
}: {
  selectedLog: DocumentLog | EvaluatedDocumentLog | undefined
  page: number | undefined
  isLoading: boolean
}) {
  const uuid = selectedLog?.uuid
  const { url } = useGenerateDocumentLogDetailUrl({
    page,
    documentLogUuid: uuid,
  })

  if (isLoading || !uuid || !url) return undefined

  const shortCode = uuid.split('-')[0]
  const createdAt = format(selectedLog.createdAt, 'PPp')
  return {
    url,
    shortCode,
    createdAt,
  }
}
