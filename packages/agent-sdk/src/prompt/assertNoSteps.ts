import { parse } from 'promptl-ai'

import { StepsNotSupportedError } from '../errors'

type TemplateNode = {
  name?: string
  children?: TemplateNode[]
  else?: TemplateNode | null
}

function hasStepTag(node: TemplateNode): boolean {
  if ('name' in node && node.name === 'step') return true

  if ('children' in node && Array.isArray(node.children)) {
    return node.children.some(hasStepTag)
  }

  if ('else' in node && node.else) {
    return hasStepTag(node.else as TemplateNode)
  }

  return false
}

/** Throws if the prompt contains <step> tags. */
export function assertNoSteps(prompt: string): void {
  const fragment = parse(prompt) as unknown as TemplateNode
  if (hasStepTag(fragment)) {
    throw new StepsNotSupportedError('PromptL <step> is not supported')
  }
}
