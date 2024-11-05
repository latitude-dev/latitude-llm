export const CUSTOM_TAG_START = '{{'
export const CUSTOM_TAG_END = '}}'

// <message role="…">
export const CUSTOM_MESSAGE_TAG = 'message' as const
export const CUSTOM_MESSAGE_ROLE_ATTR = 'role' as const

// <prompt path="…" />
export const REFERENCE_PROMPT_TAG = 'prompt' as const
export const REFERENCE_PROMPT_ATTR = 'path' as const
export const REFERENCE_DEPTH_LIMIT = 50

// <tool_call id="…" name="…">{ content }</tool_call>
export const TOOL_CALL_TAG = 'tool-call' as const

// <response as="…" />
export const CHAIN_STEP_TAG = 'response' as const

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
