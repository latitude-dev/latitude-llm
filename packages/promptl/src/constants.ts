export const CUSTOM_TAG_START = '{{'
export const CUSTOM_TAG_END = '}}'

// <message role="…">
export const CUSTOM_MESSAGE_TAG = 'message' as const
export const CUSTOM_MESSAGE_ROLE_ATTR = 'role' as const

export const CUSTOM_CONTENT_TAG = 'content' as const
export const CUSTOM_CONTENT_TYPE_ATTR = 'type' as const

// <prompt path="…" />
export const REFERENCE_PROMPT_TAG = 'prompt' as const
export const REFERENCE_PROMPT_ATTR = 'path' as const
export const REFERENCE_DEPTH_LIMIT = 50

// <response as="…" />
export const CHAIN_STEP_TAG = 'step' as const
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
