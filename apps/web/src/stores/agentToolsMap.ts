import { HEAD_COMMIT } from '@latitude-data/core/browser'
import { SWRConfiguration } from 'swr'
import useDocumentVersions from './documentVersions'
import { useMemo } from 'react'
import { getAgentToolName } from '@latitude-data/core/services/agents/helpers'
import type { AgentToolsMap } from '@latitude-data/core/browser'

export function useAgentToolsMap(
  {
    commitUuid = HEAD_COMMIT,
    projectId,
  }: { commitUuid?: string; projectId?: number } = { commitUuid: HEAD_COMMIT },
  opts: SWRConfiguration = {},
) {
  const { data, isLoading, error } = useDocumentVersions(
    { commitUuid, projectId },
    opts,
  )

  const agentToolsMap: AgentToolsMap = useMemo(() => {
    if (!data) return {}
    return data.reduce((acc: AgentToolsMap, document) => {
      if (document.documentType === 'agent') {
        acc[getAgentToolName(document.path)] = document.path
      }
      return acc
    }, {})
  }, [data])

  return { data: agentToolsMap, isLoading, error }
}
