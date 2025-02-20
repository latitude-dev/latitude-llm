import { AGENT_TOOL_PREFIX } from '../../browser'

export function getAgentToolName(agentPath: string): string {
  return `${AGENT_TOOL_PREFIX}_${agentPath.replace(/\//g, '_')}`
}
