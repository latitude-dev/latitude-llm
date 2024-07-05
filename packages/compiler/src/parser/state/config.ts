import PARSER_ERRORS from '$/error/errors'
import { Parser } from '$/parser'
import type { Config } from '$/parser/interfaces'
import yaml from 'yaml'

export function config(parser: Parser) {
  const start = parser.index
  parser.eat('---')

  // Read until there is a line break followed by a triple dash
  const data = parser.readUntil(/\n\s*\-\-\-\s*/)

  parser.allowWhitespace()
  parser.eat('---', true)

  let parsedData
  try {
    parsedData = yaml.parse(data)
  } catch (error) {
    parser.error(PARSER_ERRORS.invalidConfig((error as Error).message), start)
  }

  const node = {
    start,
    end: parser.index,
    type: 'Config',
    raw: data,
    value: parsedData,
  } as Config

  parser.current().children!.push(node)
}
