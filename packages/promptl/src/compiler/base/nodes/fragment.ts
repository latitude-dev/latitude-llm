import { Fragment } from '$promptl/parser/interfaces'

import { CompileNodeContext } from '../types'

export async function compile({
  node,
  scope,
  isInsideStepTag,
  isInsideContentTag,
  isInsideMessageTag,
  resolveBaseNode,
}: CompileNodeContext<Fragment>) {
  for await (const childNode of node.children ?? []) {
    await resolveBaseNode({
      node: childNode,
      scope,
      isInsideStepTag,
      isInsideMessageTag,
      isInsideContentTag,
    })
  }
}
