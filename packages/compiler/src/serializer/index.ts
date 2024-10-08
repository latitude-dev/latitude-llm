import { TOOL_CALL_TAG } from '$compiler/constants'
import { Conversation, MessageRole } from '$compiler/types'
import yaml from 'yaml'

function addIndent(text: string, indent: number): string {
  return text
    .split('\n')
    .map((line) => ' '.repeat(indent) + line)
    .join('\n')
}

export function serialize(conversation: Conversation): string {
  let output = ''

  if (Object.keys(conversation.config).length > 0) {
    const yamlConfig = yaml.stringify(conversation.config, { indent: 2 }).trim()
    output += `---\n${yamlConfig}\n---\n`
  }

  for (const message of conversation.messages) {
    // Tag Attributes
    const msgAttrs: Record<string, unknown> = {}
    if (message.role === MessageRole.user) {
      if (message.name !== undefined) {
        msgAttrs.name = message.name
      }
    }
    if (message.role === MessageRole.tool) {
      if (message.id !== undefined) {
        msgAttrs.id = message.id
      }
    }

    output += `<${message.role}`
    for (const [attrKey, attrVal] of Object.entries(msgAttrs)) {
      output += ` ${attrKey}=${JSON.stringify(attrVal)}`
    }
    output += '>\n'

    if (typeof message.content === 'string') {
      output += addIndent(message.content, 2) + '\n'
    } else {
      for (const content of message.content) {
        if (content.type === 'text') {
          output += addIndent(content.text, 2) + '\n'
          continue
        }

        output += addIndent(`<${content.type}>`, 2) + '\n'
        // TODO: image content can be more things than just a string. Need to
        // handle that. Possible types: string | Uint8Array | Buffer |
        // ArrayBuffer | URL
        output += addIndent(content.image as string, 4) + '\n'
        output += addIndent(`</${content.type}>`, 2) + '\n'
      }
    }

    if (message.role === MessageRole.assistant) {
      for (const toolCall of message.toolCalls) {
        const hasArgs = Object.keys(toolCall.arguments ?? {}).length > 0
        output +=
          addIndent(
            `<${TOOL_CALL_TAG} id="${toolCall.id}" name="${toolCall.name}"${hasArgs ? '' : ' /'}>`,
            2,
          ) + '\n'
        if (hasArgs) {
          const toolArgs = JSON.stringify(toolCall.arguments ?? {}, null, 2)
          output += addIndent(toolArgs, 4) + '\n'
        }
        output += `</${TOOL_CALL_TAG}>\n`
      }
    }

    output += `</${message.role}>\n`
  }

  return output.trim()
}
