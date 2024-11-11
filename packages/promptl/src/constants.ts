import { ContentTypeTagName, MessageRole } from './types'

export const CUSTOM_TAG_START = '{{'
export const CUSTOM_TAG_END = '}}'

export enum TAG_NAMES {
  message = 'message',
  system = MessageRole.system,
  user = MessageRole.user,
  assistant = MessageRole.assistant,
  tool = MessageRole.tool,
  content = 'content',
  text = ContentTypeTagName.text,
  image = ContentTypeTagName.image,
  toolCall = ContentTypeTagName.toolCall,
  prompt = 'prompt',
  step = 'step',
}

export const CUSTOM_MESSAGE_ROLE_ATTR = 'role' as const
export const CUSTOM_CONTENT_TYPE_ATTR = 'type' as const
export const REFERENCE_PROMPT_ATTR = 'path' as const
export const REFERENCE_DEPTH_LIMIT = 50
export const CHAIN_STEP_ISOLATED_ATTR = 'isolated' as const

export enum KEYWORDS {
  if = 'if',
  endif = 'endif',
  else = 'else',
  for = 'for',
  endfor = 'endfor',
  as = 'as',
  in = 'in',
  true = 'true',
  false = 'false',
  null = 'null',
}

export const RESERVED_KEYWORDS = Object.values(KEYWORDS)
export const RESERVED_TAGS = Object.values(TAG_NAMES)
