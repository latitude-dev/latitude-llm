import { isEqual } from 'lodash-es'
import { useEffect, useMemo, useState } from 'react'
import { SWRConfiguration } from 'swr'
import useDocumentVersions from './documentVersions'
import { getAgentToolName } from '@latitude-data/core/services/agents/helpers'
import { AgentToolsMap } from '@latitude-data/constants'

import { HEAD_COMMIT } from '@latitude-data/core/constants'

import { DocumentVersion } from '@latitude-data/core/schema/models/types/DocumentVersion'
function buildAgentsToolMap(data: DocumentVersion[] = []) {
  if (!data) return {}
  return data.reduce((acc: AgentToolsMap, document) => {
    if (document.documentType === 'agent') {
      acc[getAgentToolName(document.path)] = document.path
    }
    return acc
  }, {})
}
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

  const [agentToolsMap, setAgentToolsMap] = useState<AgentToolsMap>({})

  useEffect(() => {
    if (isLoading || error) return

    setAgentToolsMap((prev) => {
      const newAgentToolMaps = buildAgentsToolMap(data)

      return isEqual(prev, newAgentToolMaps) ? prev : newAgentToolMaps
    })
  }, [data, isLoading, error])

  return useMemo(
    () => ({ data: agentToolsMap, isLoading, error }),
    [agentToolsMap, isLoading, error],
  )
}
