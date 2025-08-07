import { hash } from 'node:crypto'

export function hashContent(content: string) {
  return hash('md5', content)
}
