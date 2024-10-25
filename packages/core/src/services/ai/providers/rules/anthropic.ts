import type { ContentType, MessageRole } from '@latitude-data/compiler'

import { AppliedRules, ApplyCustomRulesProps } from '.'

export function applyAnthropicRules({
  messages,
}: ApplyCustomRulesProps): AppliedRules | undefined {
  if (!messages.some((m) => m.role === 'system')) return

  return {
    rule: 'AnthropicMultipleSystemMessagesUnsupported',
    ruleMessage:
      'Anthropic does not support multiple system messages. All system messages have been converted to user messages. If you want to add a system prompt please include it in the prompt frontmatter.',
    messages: messages.map((m) => {
      if (m.role !== 'system') return m
      return {
        ...m,
        role: 'user' as MessageRole.user,
        content: [{ type: 'text' as ContentType.text, text: m.content }],
      }
    }),
  }
}
