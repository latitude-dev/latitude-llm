import { Config as ConfigNode } from '$compiler/parser/interfaces'

import { CompileNodeContext } from '../types'

export async function compile({
  node,
  setConfig,
}: CompileNodeContext<ConfigNode>): Promise<void> {
  setConfig(node.value)
}
