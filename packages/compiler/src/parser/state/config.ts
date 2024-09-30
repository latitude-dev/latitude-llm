import PARSER_ERRORS from '$compiler/error/errors'
import { Parser } from '$compiler/parser'
import type { Config } from '$compiler/parser/interfaces'

export function config(parser: Parser) {
  const start = parser.index
  parser.eat('---')

  // Read until there is a line break followed by a triple dash
  const currentIndex = parser.index
  const data = parser.readUntil(/\n\s*---\s*/)
  if (parser.index === parser.template.length) {
    parser.error(PARSER_ERRORS.unexpectedToken('---'), currentIndex + 1)
  }

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
