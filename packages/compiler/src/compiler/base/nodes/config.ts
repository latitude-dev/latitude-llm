import type { Config as ConfigNode } from '$compiler/parser/interfaces'
import yaml from 'yaml'

import type { CompileNodeContext } from '../types'

export async function compile({ node, setConfig }: CompileNodeContext<ConfigNode>): Promise<void> {
  setConfig(yaml.parse(node.value))
}
