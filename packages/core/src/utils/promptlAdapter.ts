import {
  Message as LegacyMessage,
  MessageRole,
  MessageContent as LegacyMessageContent,
  ToolRequestContent as LegacyToolRequestContent,
  ToolCall as LegacyToolCall,
  AssistantMessage as LegacyAssistantMessage,
  UserMessage as LegacyUserMessage,
  ToolMessage as LegacyToolMessage,
} from '@latitude-data/constants/legacyCompiler'
import {
  Message as PromptlMessage,
  MessageRole as PromptlMessageRole,
  ContentType as PromptlContentType,
  ToolMessage as PromptlToolMessage,
} from 'promptl-ai'

/**
 * Adapter function to convert promptl-ai Message types to legacy compiler Message types.
 * This is needed because the MessageList component expects legacy compiler message format,
 * but the tracing system stores messages in promptl-ai format.
 *
 * Handles all promptl message roles and content types:
 * - Maps developer role to system role (developer doesn't exist in legacy)
 * - Converts all content types (text, image, file, tool-call)
 * - Handles special message properties (toolCalls for assistant, toolName/toolId for tool messages, name for user messages)
 */
export function adaptPromptlMessageToLegacy(
  message: PromptlMessage,
): LegacyMessage {
  // Map promptl roles to legacy roles (they're mostly the same, but handle developer role)
  let role: LegacyMessage['role']
  switch (message.role) {
    case PromptlMessageRole.developer:
      // Developer role doesn't exist in legacy, map to system
      role = MessageRole.system
      break
    case PromptlMessageRole.system:
      role = MessageRole.system
      break
    case PromptlMessageRole.user:
      role = MessageRole.user
      break
    case PromptlMessageRole.assistant:
      role = MessageRole.assistant
      break
    case PromptlMessageRole.tool:
      role = MessageRole.tool
      break
    default:
      // Fallback for any new roles
      role = MessageRole.user
  }

  // Convert promptl content array to legacy content array
  const legacyContent = Array.isArray(message.content)
    ? message.content.map((contentItem): LegacyMessageContent => {
        switch (contentItem.type) {
          case PromptlContentType.text:
            return {
              type: 'text',
              text: contentItem.text,
            }

          case PromptlContentType.image:
            return {
              type: 'image',
              image: contentItem.image,
            }

          case PromptlContentType.file:
            return {
              type: 'file',
              file: contentItem.file,
              mimeType: contentItem.mimeType,
            }

          case PromptlContentType.toolCall:
            return {
              type: 'tool-call',
              toolCallId: contentItem.toolCallId,
              toolName: contentItem.toolName,
              // @ts-expect-error - TODO: What is happening here? promptl
              // messages are supposed to have a toolArguments property yet in
              // truth this has a .args argument
              args: contentItem.args,
            }
          default:
            return contentItem
        }
      })
    : message.content

  // Handle special cases for different message types
  if (message.role === PromptlMessageRole.assistant) {
    // For assistant messages, we need to extract tool calls and handle the special content format
    const toolCalls = legacyContent
      .filter(
        (content): content is LegacyToolRequestContent =>
          content.type === 'tool-call',
      )
      .map(
        (toolCall): LegacyToolCall => ({
          id: toolCall.toolCallId,
          name: toolCall.toolName,
          arguments: toolCall.args,
          _sourceData: undefined, // promptl doesn't have source data
        }),
      )

    return {
      role,
      content: legacyContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
    } as LegacyAssistantMessage
  }

  if (message.role === PromptlMessageRole.tool) {
    // For tool messages, we need to handle the special tool message format
    return {
      role,
      content: legacyContent,
      toolName: (message as PromptlToolMessage).toolName,
      toolId: (message as PromptlToolMessage).toolId,
    } as LegacyToolMessage
  }

  if (message.role === PromptlMessageRole.user && 'name' in message) {
    // For user messages with names
    return {
      role,
      content: legacyContent,
      name: message.name,
    } as LegacyUserMessage
  }

  // Default case for system, user, and other messages
  return {
    role,
    content: legacyContent,
  } as LegacyMessage
}
