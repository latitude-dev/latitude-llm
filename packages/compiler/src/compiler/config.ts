import { Fragment } from '../parser/interfaces'

export function readConfig(fragment: Fragment): Record<string, unknown> {
  for (const node of fragment.children) {
    if (node.type === 'Config') {
      return node.value
    }
  }
  return {}
}
