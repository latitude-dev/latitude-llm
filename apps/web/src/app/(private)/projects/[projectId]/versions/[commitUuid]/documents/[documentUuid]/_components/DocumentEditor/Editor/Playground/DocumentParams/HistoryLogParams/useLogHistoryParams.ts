import { useCallback, useState } from 'react'

import { DocumentLog, DocumentVersion } from '@latitude-data/core/browser'
import { useCurrentCommit, useCurrentProject } from '@latitude-data/web-ui'
import { Inputs, useDocumentParameters } from '$/hooks/useDocumentParameters'
import useDocumentLogs from '$/stores/documentLogs'
import useDocumentLogWithPaginationPosition, {
  LogWithPosition,
} from '$/stores/documentLogWithPaginationPosition'
import useDocumentLogsPagination from '$/stores/useDocumentLogsPagination'

function getValue({ paramValue }: { paramValue: unknown | undefined }) {
  try {
    const value = JSON.stringify(paramValue)
    return { value, metadata: { includeInPrompt: paramValue !== undefined } }
  } catch {
    return { value: '', metadata: { includeInPrompt: false } }
  }
}

function mapLogParametersToInputs({
  inputs,
  parameters,
}: {
  inputs: Inputs<'history'>
  parameters: DocumentLog['parameters'] | undefined
}): Inputs<'history'> | undefined {
  const params = parameters ?? {}
  // No parameters
  if (!Object.keys(params).length) return undefined

  return Object.entries(inputs).reduce((acc, [key]) => {
    acc[key] = getValue({ paramValue: params[key] })
    return acc
  }, {} as Inputs<'history'>)
}

const ONLY_ONE_PAGE = '1'
export function useLogHistoryParams({
  document,
  commitVersionUuid,
}: {
  document: DocumentVersion
  commitVersionUuid: string
}) {
  const {
    history: { inputs, setInputs, setHistoryLog, logUuid },
  } = useDocumentParameters({
    documentVersionUuid: document.documentUuid,
    commitVersionUuid,
  })
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: pagination, isLoading: isLoadingCounter } =
    useDocumentLogsPagination({
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
      page: '1', // Not used really. This is only for the counter.
      pageSize: ONLY_ONE_PAGE,
      excludeErrors: true,
    })

  const [position, setPosition] = useState<LogWithPosition | undefined>(
    logUuid ? undefined : { position: 1, page: 1 },
  )
  const onFetchCurrentLog = useCallback(
    (data: LogWithPosition) => {
      setPosition(data)
    },
    [logUuid],
  )
  const { isLoading: isLoadingPosition } = useDocumentLogWithPaginationPosition(
    {
      projectId: project.id,
      commitUuid: commit.uuid,
      document,
      documentLogUuid: logUuid,
      onFetched: onFetchCurrentLog,
      excludeErrors: true,
    },
  )

  const { data: logs, isLoading: isLoadingLog } = useDocumentLogs({
    documentUuid: position === undefined ? undefined : document.documentUuid,
    commitUuid: commit.uuid,
    projectId: project.id,
    page: position === undefined ? undefined : String(position.position),
    pageSize: ONLY_ONE_PAGE,
    excludeErrors: true,
    onFetched: (logs) => {
      const log = logs[0]
      if (!log) return

      const newInputs = mapLogParametersToInputs({
        inputs,
        parameters: log.parameters,
      })

      if (!newInputs) return

      setInputs(newInputs)
      setHistoryLog(log.uuid)
    },
  })

  const updatePosition = useCallback(
    (position: number) => {
      if (isLoadingLog) return

      setPosition((prev) =>
        prev ? { ...prev, position } : { position, page: 1 },
      )
    },
    [isLoadingLog],
  )

  const onNextPage = useCallback(
    (position: number) => updatePosition(position + 1),
    [updatePosition],
  )

  const onPrevPage = useCallback(
    (position: number) => updatePosition(position - 1),
    [updatePosition],
  )

  const isLoading = isLoadingLog || isLoadingCounter
  const log = logs?.[0]
  return {
    selectedLog: log,
    isLoadingLog: isLoadingPosition || isLoadingLog,
    isLoading,
    page: position?.page,
    position: position?.position,
    count: pagination?.count ?? 0,
    onNextPage,
    onPrevPage,
  }
}

export type UseLogHistoryParams = ReturnType<typeof useLogHistoryParams>
