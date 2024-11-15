import { useCallback, useState } from 'react'

import { DocumentLog } from '@latitude-data/core/browser'
import { useCurrentCommit, useCurrentProject } from '@latitude-data/web-ui'
import { useCurrentDocument } from '$/app/providers/DocumentProvider'
import { PlaygroundInputs } from '$/hooks/useDocumentParameters'
import useDocumentLogs from '$/stores/documentLogs'
import useDocumentLogWithPaginationPosition, {
  LogWithPosition,
} from '$/stores/documentLogWithPaginationPosition'
import useDocumentLogsPagination from '$/stores/useDocumentLogsPagination'

import { useSelectedLogRow } from './useSelectedRow'

function getValue({ paramValue }: { paramValue: unknown | undefined }) {
  try {
    const value = JSON.stringify(paramValue)
    return { value, includedInPrompt: paramValue !== undefined }
  } catch {
    return { value: '', includedInPrompt: false }
  }
}

function mapLogParametersToInputs({
  inputs,
  parameters,
}: {
  inputs: PlaygroundInputs
  parameters: DocumentLog['parameters'] | undefined
}): PlaygroundInputs | undefined {
  const params = parameters ?? {}
  // No parameters
  if (!Object.keys(params).length) return undefined

  return Object.entries(inputs).reduce((acc, [key]) => {
    acc[key] = getValue({ paramValue: params[key] })
    return acc
  }, {} as PlaygroundInputs)
}

const ONLY_ONE_PAGE = '1'
export function useLogHistoryParams({
  inputs,
  setInputs,
}: {
  inputs: PlaygroundInputs
  setInputs: (newInputs: PlaygroundInputs) => void
}) {
  const document = useCurrentDocument()
  const { saveRowInfo, selectedRow } = useSelectedLogRow({ document })
  const selectedLogUuid = selectedRow?.documentLogUuid
  const { project } = useCurrentProject()
  const { commit } = useCurrentCommit()
  const { data: pagination, isLoading: isLoadingCounter } =
    useDocumentLogsPagination({
      projectId: project.id,
      commitUuid: commit.uuid,
      documentUuid: document.documentUuid,
      page: '1', // Not used really. This is only for the counter.
      pageSize: ONLY_ONE_PAGE,
    })

  const [position, setPosition] = useState<LogWithPosition | undefined>(
    selectedLogUuid ? undefined : { position: 1, page: 1 },
  )
  const onFetchCurrentLog = useCallback(
    (data: LogWithPosition) => {
      setPosition(data)
    },
    [selectedLogUuid],
  )
  const { isLoading: isLoadingPosition } = useDocumentLogWithPaginationPosition(
    {
      documentLogUuid: selectedLogUuid,
      onFetched: onFetchCurrentLog,
    },
  )

  const { data: logs, isLoading: isLoadingLog } = useDocumentLogs({
    documentUuid: position === undefined ? undefined : document.documentUuid,
    commitUuid: commit.uuid,
    projectId: project.id,
    page: position === undefined ? undefined : String(position.position),
    pageSize: ONLY_ONE_PAGE,
    onFetched: (logs) => {
      const log = logs[0]
      if (!log) return

      const newInputs = mapLogParametersToInputs({
        inputs,
        parameters: log.parameters,
      })

      if (!newInputs) return

      setInputs(newInputs)
      saveRowInfo({ documentLogUuid: log.uuid })
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
