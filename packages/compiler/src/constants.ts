export const CUSTOM_TAG_START = '{{'
export const CUSTOM_TAG_END = '}}'

// <message role="…">
export const CUSTOM_MESSAGE_TAG = 'message' as const
export const CUSTOM_MESSAGE_ROLE_ATTR = 'role' as const

// <ref prompt="…">
export const REFERENCE_PROMPT_TAG = 'ref' as const
export const REFERENCE_PROMPT_ATTR = 'prompt' as const
export const REFERENCE_DEPTH_LIMIT = 50

// <tool_call id="…" name="…">{ content }</tool_call>
export const TOOL_CALL_TAG = 'tool-call' as const

export const CHAIN_STEP_TAG = 'step' as const
