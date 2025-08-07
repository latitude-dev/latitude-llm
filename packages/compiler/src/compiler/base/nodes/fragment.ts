import type { Fragment } from '$compiler/parser/interfaces'

import type { CompileNodeContext } from '../types'

export async function compile({
  node,
  scope,
  isInsideContentTag,
  isInsideMessageTag,
  resolveBaseNode,
}: CompileNodeContext<Fragment>) {
  for await (const childNode of node.children ?? []) {
    await resolveBaseNode({
      node: childNode,
      scope,
      isInsideMessageTag,
      isInsideContentTag,
    })
  }
}
