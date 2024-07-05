import type { Fragment } from '$/parser/interfaces'
import type { Config } from '$/types'

export function readConfig(fragment: Fragment): Config {
  for (const node of fragment.children) {
    if (node.type === 'Config') {
      return node.value
    }
  }
  return {}
}
