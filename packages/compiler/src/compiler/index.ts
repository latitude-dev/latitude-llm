import { Conversation } from '../types'
import { Compile, type ReferencePromptFn } from './compile'

export function compile({
  prompt,
  parameters,
  referenceFn,
}: {
  prompt: string
  parameters: Record<string, unknown>
  referenceFn?: ReferencePromptFn
}): Promise<Conversation> {
  return new Compile({ prompt, parameters, referenceFn }).run()
}
