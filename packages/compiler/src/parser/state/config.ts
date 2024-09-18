import { Parser } from '$compiler/parser'
import type { Config } from '$compiler/parser/interfaces'

export function config(parser: Parser) {
  const start = parser.index
  parser.eat('---')

  // Read until there is a line break followed by a triple dash
  const data = parser.readUntil(/\n\s*---\s*/)

  parser.allowWhitespace()
  parser.eat('---', true)
  parser.eat('\n')

  const node = {
    start,
    end: parser.index,
    type: 'Config',
    raw: data,
    value: data,
  } as Config

  parser.current().children!.push(node)
}
