import { AGENT_TOOL_PREFIX } from '@latitude-data/constants'

export function getAgentToolName(agentPath: string): string {
  return `${AGENT_TOOL_PREFIX}_${agentPath.replace(/\//g, '_')}`
}
