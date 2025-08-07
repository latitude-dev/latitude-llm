import type { AstError } from '@latitude-data/constants/promptl'
import { BLOCK_EDITOR_TYPE, type CodeBlock, type TemplateNode } from './types'
import { createTextNode } from './astParsingUtils'

function getDefaultText({ prompt, node }: { prompt: string; node: TemplateNode }) {
  const start = node.start
  const end = node.end

  if (start === null || end === null) return null

  return prompt.slice(start, end)
}

export function createCodeBlock({
  node,
  prompt,
  errors,
  getText,
}: {
  node: TemplateNode
  prompt: string
  errors?: AstError[]
  getText?: (args: { prompt: string; node: TemplateNode }) => string | null
}) {
  const textFn = getText ? getText : getDefaultText
  const rawText = textFn({ prompt, node })
  return {
    type: BLOCK_EDITOR_TYPE.CODE,
    version: 1,
    children: [createTextNode({ text: rawText ?? '' })],
    errors,
  } satisfies CodeBlock
}
