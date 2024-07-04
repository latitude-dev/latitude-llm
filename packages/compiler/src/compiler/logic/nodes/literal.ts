import { type Literal } from 'estree'

import { type ResolveNodeProps } from '../types'

/**
 * ### Literal
 * Represents a literal value.
 */
export async function resolve({ node }: ResolveNodeProps<Literal>) {
  return node.value
}

export function updateScopeContext() {
  // Do nothing
}
