import { AGENT_TOOL_PREFIX } from '@latitude-data/constants'

export const MAX_TOOL_NAME_LENGTH = 64

export function getAgentToolName(agentPath: string): string {
  const maxSuffixLength = MAX_TOOL_NAME_LENGTH - AGENT_TOOL_PREFIX.length - 1
  const suffix = agentPath
    .slice(Math.max(0, agentPath.length - maxSuffixLength))
    .replace(/\//g, '_')

  return `${AGENT_TOOL_PREFIX}_${suffix}`
}
