'use client'

import useDocumentLogsDailyCount from '$/stores/documentLogsDailyCount'

import { LogsOverTime } from '../../../../../overview/_components/Overview/LogsOverTime'

export function LogsOverTimeChart({
  documentUuid,
  commitUuid,
  projectId,
}: {
  documentUuid: string
  commitUuid: string
  projectId: number
}) {
  const { data, isLoading, error } = useDocumentLogsDailyCount({
    documentUuid,
    commitUuid,
    projectId,
  })

  return <LogsOverTime data={data} isLoading={isLoading} error={error} />
}
