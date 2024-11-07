import { Text } from '$promptl/parser/interfaces'

import { CompileNodeContext } from '../types'

export async function compile({
  node,
  addStrayText,
}: CompileNodeContext<Text>) {
  addStrayText(node.data)
}
