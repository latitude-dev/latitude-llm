import { MessageContent, MessageRole } from '@latitude-data/compiler'
import { AGENT_RETURN_TOOL_NAME } from '@latitude-data/core/browser'

export const ROLE_VARIANS = ['user', 'system', 'assistant']

export const roleVariant = (role: string) => {
  switch (role) {
    case 'user':
      return 'purple'
    case 'system':
      return 'outline'
    case 'assistant':
      return 'yellow'
    case 'tool':
      return 'muted'
    default:
      return 'default'
  }
}

export function roleToString(role: string) {
  if (role === 'tool') return 'Tool response'
  return role.charAt(0).toUpperCase() + role.slice(1)
}

export function isAgentToolResponse(message: {
  role: MessageRole
  content: string | MessageContent[]
}) {
  if (message.role !== MessageRole.tool) return false
  if (typeof message.content === 'string') return false

  const agentToolResults = message.content.filter(
    (c) => c.toolName == AGENT_RETURN_TOOL_NAME,
  )

  if (agentToolResults.length == 0) return false
  return agentToolResults.length == message.content.length
}
