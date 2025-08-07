import type { Text } from '$compiler/parser/interfaces'

import type { CompileNodeContext } from '../types'

export async function compile({ node, addStrayText }: CompileNodeContext<Text>) {
  addStrayText(node.data)
}
